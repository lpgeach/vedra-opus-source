// vo-decode for macOS (docs/briefs/R3-os-decoders.md): reads a media file through
// AVFoundation, macOS's own licensed decoders, and hands the picture and sound on in
// plain forms for our ffmpeg to encode.
//
//   vo-decode info  <file>            one line of JSON
//   vo-decode audio <file> <out.wav>  the sound as 16-bit PCM WAV
//   vo-decode video <file>            the picture as YUV4MPEG2 4:2:0 on standard output,
//                                     at a constant frame rate
//
// Built with swiftc by scripts/build-decoder.sh.
import AVFoundation
import CoreMedia
import CoreVideo
import Foundation

func fail(_ message: String) -> Never {
  FileHandle.standardError.write("vo-decode: \(message)\n".data(using: .utf8)!)
  exit(1)
}

let arguments = CommandLine.arguments
guard arguments.count >= 3 else { fail("usage: vo-decode info|audio|video <file> [out.wav]") }
let asset = AVURLAsset(url: URL(fileURLWithPath: arguments[2]))
let videoTrack = asset.tracks(withMediaType: .video).first
let audioTrack = asset.tracks(withMediaType: .audio).first

/// Degrees to turn the picture clockwise to show it upright.
func rotation(of track: AVAssetTrack) -> Int {
  let t = track.preferredTransform
  let degrees = Int((atan2(Double(t.b), Double(t.a)) * 180 / Double.pi).rounded())
  return ((degrees % 360) + 360) % 360
}

/// The frame rate as a fraction, for the YUV4MPEG2 header.
func frameRate(of track: AVAssetTrack) -> (Int, Int) {
  let fps = Double(track.nominalFrameRate)
  return fps > 0 ? (Int((fps * 1000).rounded()), 1000) : (30, 1)
}

/// The sound as 16-bit PCM, keeping its rate, in one or two channels.
func audioSettings(of track: AVAssetTrack) -> ([String: Any], Int, Int)? {
  guard let description = track.formatDescriptions.first,
    let basic = CMAudioFormatDescriptionGetStreamBasicDescription(
      description as! CMAudioFormatDescription)?.pointee
  else { return nil }
  let rate = Int(basic.mSampleRate)
  let channels = min(max(Int(basic.mChannelsPerFrame), 1), 2)
  guard rate > 0 else { return nil }
  let settings: [String: Any] = [
    AVFormatIDKey: kAudioFormatLinearPCM,
    AVLinearPCMBitDepthKey: 16,
    AVLinearPCMIsFloatKey: false,
    AVLinearPCMIsBigEndianKey: false,
    AVLinearPCMIsNonInterleaved: false,
    AVSampleRateKey: rate,
    AVNumberOfChannelsKey: channels,
  ]
  return (settings, rate, channels)
}

let pictureSettings: [String: Any] = [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
]

/// A reader started on one track, or nil when the system cannot decode it.
func startReader(_ track: AVAssetTrack, _ settings: [String: Any]) -> (AVAssetReader, AVAssetReaderTrackOutput)? {
  guard track.isDecodable, let reader = try? AVAssetReader(asset: asset) else { return nil }
  let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
  output.alwaysCopiesSampleData = false
  guard reader.canAdd(output) else { return nil }
  reader.add(output)
  return reader.startReading() ? (reader, output) : nil
}

func info() {
  let duration = CMTimeGetSeconds(asset.duration)
  var parts = ["\"duration\":\(duration.isFinite ? String(format: "%.6f", duration) : "0")"]
  var unreadable: [String] = []
  if let track = videoTrack {
    if let (reader, _) = startReader(track, pictureSettings) {
      reader.cancelReading()
      let size = track.naturalSize
      let (num, den) = frameRate(of: track)
      parts.append(
        "\"video\":{\"width\":\(Int(size.width) & ~1),\"height\":\(Int(size.height) & ~1),\"fps\":\"\(num)/\(den)\",\"rotation\":\(rotation(of: track))}"
      )
    } else {
      unreadable.append("\"video\"")
      parts.append("\"video\":null")
    }
  } else {
    parts.append("\"video\":null")
  }
  if let track = audioTrack, let (settings, rate, channels) = audioSettings(of: track),
    let (reader, _) = startReader(track, settings)
  {
    reader.cancelReading()
    parts.append("\"audio\":{\"sampleRate\":\(rate),\"channels\":\(channels)}")
  } else {
    if audioTrack != nil { unreadable.append("\"audio\"") }
    parts.append("\"audio\":null")
  }
  parts.append("\"unreadable\":[\(unreadable.joined(separator: ","))]")
  print("{\(parts.joined(separator: ","))}")
}

func littleEndian32(_ value: UInt32) -> [UInt8] {
  [UInt8(value & 0xff), UInt8((value >> 8) & 0xff), UInt8((value >> 16) & 0xff), UInt8(value >> 24)]
}

func wavHeader(rate: Int, channels: Int, data: UInt32) -> Data {
  var header = [UInt8]("RIFF".utf8) + littleEndian32(36 &+ data) + [UInt8]("WAVEfmt ".utf8)
  header += littleEndian32(16) + [1, 0, UInt8(channels), 0] + littleEndian32(UInt32(rate))
  header += littleEndian32(UInt32(rate * channels * 2)) + [UInt8(channels * 2), 0, 16, 0]
  header += [UInt8]("data".utf8) + littleEndian32(data)
  return Data(header)
}

func audio(to path: String) {
  guard let track = audioTrack, let (settings, rate, channels) = audioSettings(of: track),
    let (reader, output) = startReader(track, settings)
  else { fail("the system cannot decode this sound") }
  guard FileManager.default.createFile(atPath: path, contents: nil),
    let file = FileHandle(forWritingAtPath: path)
  else { fail("cannot write the sound file") }
  file.write(wavHeader(rate: rate, channels: channels, data: 0))
  var written: UInt64 = 0
  while let sample = output.copyNextSampleBuffer() {
    guard let block = CMSampleBufferGetDataBuffer(sample) else { continue }
    let length = CMBlockBufferGetDataLength(block)
    var bytes = Data(count: length)
    let status = bytes.withUnsafeMutableBytes { pointer in
      CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: pointer.baseAddress!)
    }
    if status == kCMBlockBufferNoErr {
      file.write(bytes)
      written += UInt64(length)
    }
  }
  if reader.status == .failed { fail("the sound could not be decoded") }
  file.seek(toFileOffset: 0)
  file.write(wavHeader(rate: rate, channels: channels, data: UInt32(min(written, 0xFFFF_FFDB))))
  file.closeFile()
}

/// One decoded NV12 frame, cut to even size and turned into I420.
func toI420(_ buffer: CVPixelBuffer, width: Int, height: Int, into out: inout [UInt8]) {
  CVPixelBufferLockBaseAddress(buffer, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
  guard let luma = CVPixelBufferGetBaseAddressOfPlane(buffer, 0),
    let chroma = CVPixelBufferGetBaseAddressOfPlane(buffer, 1)
  else { return }
  let lumaPitch = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
  let chromaPitch = CVPixelBufferGetBytesPerRowOfPlane(buffer, 1)
  let y = luma.assumingMemoryBound(to: UInt8.self)
  let uv = chroma.assumingMemoryBound(to: UInt8.self)
  let quarter = width * height / 4
  out.withUnsafeMutableBufferPointer { frame in
    for row in 0..<height {
      for col in 0..<width { frame[row * width + col] = y[row * lumaPitch + col] }
    }
    let u = width * height
    let v = u + quarter
    for row in 0..<(height / 2) {
      for col in 0..<(width / 2) {
        frame[u + row * (width / 2) + col] = uv[row * chromaPitch + col * 2]
        frame[v + row * (width / 2) + col] = uv[row * chromaPitch + col * 2 + 1]
      }
    }
  }
}

func put(_ frame: [UInt8]) {
  let marker = Array("FRAME\n".utf8)
  if fwrite(marker, 1, marker.count, stdout) != marker.count
    || fwrite(frame, 1, frame.count, stdout) != frame.count
  {
    fail("the output was closed")
  }
}

func video() {
  guard let track = videoTrack, let (reader, output) = startReader(track, pictureSettings) else {
    fail("the system cannot decode this picture")
  }
  signal(SIGPIPE, SIG_IGN)
  let (num, den) = frameRate(of: track)
  let frameTime = Double(den) / Double(num)
  var latest: [UInt8] = []
  var width = 0
  var height = 0
  var next = 0
  var end = 0.0
  // A constant rate: each frame time shows the latest frame decoded by then.
  while let sample = output.copyNextSampleBuffer() {
    guard let buffer = CMSampleBufferGetImageBuffer(sample) else { continue }
    let at = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample))
    let length = CMTimeGetSeconds(CMSampleBufferGetDuration(sample))
    end = max(end, at + (length.isFinite && length > 0 ? length : frameTime))
    if latest.isEmpty {
      width = CVPixelBufferGetWidth(buffer) & ~1
      height = CVPixelBufferGetHeight(buffer) & ~1
      guard width > 0, height > 0 else { fail("the picture has no size") }
      print("YUV4MPEG2 W\(width) H\(height) F\(num):\(den) Ip A1:1 C420jpeg")
      fflush(stdout)
      latest = [UInt8](repeating: 0, count: width * height * 3 / 2)
    } else {
      while Double(next) * frameTime < at - 1e-6 {
        put(latest)
        next += 1
      }
    }
    toI420(buffer, width: width, height: height, into: &latest)
  }
  if reader.status == .failed { fail("the picture could not be decoded") }
  if latest.isEmpty { fail("no picture was decoded") }
  repeat {
    put(latest)
    next += 1
  } while Double(next) * frameTime < end - 1e-6
  fflush(stdout)
}

switch arguments[1] {
case "info": info()
case "audio" where arguments.count >= 4: audio(to: arguments[3])
case "video": video()
default: fail("usage: vo-decode info|audio|video <file> [out.wav]")
}

/*
 * vo-decode for Windows (docs/briefs/R3-os-decoders.md): reads a media file
 * through Media Foundation, Windows' own licensed decoders, and hands the
 * picture and sound on in plain forms for our ffmpeg to encode.
 *
 *   vo-decode info  <file>            one line of JSON
 *   vo-decode audio <file> <out.wav>  the sound as 16-bit PCM WAV
 *   vo-decode video <file>            the picture as YUV4MPEG2 4:2:0 on standard output,
 *                                     at a constant frame rate
 *
 * Built with mingw-w64 by scripts/build-decoder.sh.
 */
#define COBJMACROS
#define WIN32_LEAN_AND_MEAN
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#endif
#include <windows.h>
#include <fcntl.h>
#include <io.h>
#include <mfapi.h>
#include <mferror.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

#define FIRST_VIDEO ((DWORD)MF_SOURCE_READER_FIRST_VIDEO_STREAM)
#define FIRST_AUDIO ((DWORD)MF_SOURCE_READER_FIRST_AUDIO_STREAM)
#define ALL_STREAMS ((DWORD)MF_SOURCE_READER_ALL_STREAMS)

static int fail(const char *message) {
  fprintf(stderr, "vo-decode: %s\n", message);
  return 1;
}

static IMFSourceReader *open_reader(const wchar_t *path) {
  IMFAttributes *attributes = NULL;
  IMFSourceReader *reader = NULL;
  if (FAILED(MFCreateAttributes(&attributes, 1))) return NULL;
  /* Lets the reader convert the decoder's output to NV12 and PCM. */
  IMFAttributes_SetUINT32(attributes, &MF_SOURCE_READER_ENABLE_VIDEO_PROCESSING, TRUE);
  HRESULT hr = MFCreateSourceReaderFromURL(path, attributes, &reader);
  IMFAttributes_Release(attributes);
  return SUCCEEDED(hr) ? reader : NULL;
}

static int has_stream(IMFSourceReader *reader, DWORD stream) {
  IMFMediaType *type = NULL;
  if (FAILED(IMFSourceReader_GetNativeMediaType(reader, stream, 0, &type))) return 0;
  IMFMediaType_Release(type);
  return 1;
}

/* Ask for `subtype` out of `stream`; true when the system can decode it so. */
static int set_output(IMFSourceReader *reader, DWORD stream, REFGUID major, REFGUID subtype,
                      UINT32 bits) {
  IMFMediaType *type = NULL;
  if (FAILED(MFCreateMediaType(&type))) return 0;
  IMFMediaType_SetGUID(type, &MF_MT_MAJOR_TYPE, major);
  IMFMediaType_SetGUID(type, &MF_MT_SUBTYPE, subtype);
  if (bits) IMFMediaType_SetUINT32(type, &MF_MT_AUDIO_BITS_PER_SAMPLE, bits);
  HRESULT hr = IMFSourceReader_SetCurrentMediaType(reader, stream, NULL, type);
  IMFMediaType_Release(type);
  return SUCCEEDED(hr);
}

/* The picture as decoded: the buffer's size, and the part to show (even-sized). */
typedef struct {
  UINT32 alloc_w, alloc_h, x, y, w, h, fps_num, fps_den, rotation;
} Picture;

static int describe_video(IMFSourceReader *reader, Picture *picture) {
  IMFMediaType *native = NULL, *current = NULL;
  UINT64 packed = 0;
  memset(picture, 0, sizeof *picture);
  if (SUCCEEDED(IMFSourceReader_GetNativeMediaType(reader, FIRST_VIDEO, 0, &native))) {
    IMFMediaType_GetUINT32(native, &MF_MT_VIDEO_ROTATION, &picture->rotation);
    if (SUCCEEDED(IMFMediaType_GetUINT64(native, &MF_MT_FRAME_RATE, &packed))) {
      picture->fps_num = (UINT32)(packed >> 32);
      picture->fps_den = (UINT32)packed;
    }
    IMFMediaType_Release(native);
  }
  if (!set_output(reader, FIRST_VIDEO, &MFMediaType_Video, &MFVideoFormat_NV12, 0)) return 0;
  if (FAILED(IMFSourceReader_GetCurrentMediaType(reader, FIRST_VIDEO, &current))) return 0;
  if (FAILED(IMFMediaType_GetUINT64(current, &MF_MT_FRAME_SIZE, &packed))) {
    IMFMediaType_Release(current);
    return 0;
  }
  picture->alloc_w = (UINT32)(packed >> 32);
  picture->alloc_h = (UINT32)packed;
  picture->w = picture->alloc_w;
  picture->h = picture->alloc_h;
  MFVideoArea area;
  UINT32 size = 0;
  if (SUCCEEDED(IMFMediaType_GetBlob(current, &MF_MT_MINIMUM_DISPLAY_APERTURE, (UINT8 *)&area,
                                      sizeof area, &size)) &&
      size == sizeof area && area.Area.cx > 0 && area.Area.cy > 0) {
    picture->x = (UINT32)area.OffsetX.value;
    picture->y = (UINT32)area.OffsetY.value;
    picture->w = (UINT32)area.Area.cx;
    picture->h = (UINT32)area.Area.cy;
  }
  if (!picture->fps_num || !picture->fps_den) {
    if (SUCCEEDED(IMFMediaType_GetUINT64(current, &MF_MT_FRAME_RATE, &packed)) && (UINT32)packed) {
      picture->fps_num = (UINT32)(packed >> 32);
      picture->fps_den = (UINT32)packed;
    } else {
      picture->fps_num = 30;
      picture->fps_den = 1;
    }
  }
  IMFMediaType_Release(current);
  /* 4:2:0 needs even sizes: the last row or column goes. */
  picture->w &= ~1u;
  picture->h &= ~1u;
  return picture->w > 0 && picture->h > 0;
}

static int describe_audio(IMFSourceReader *reader, UINT32 *rate, UINT32 *channels) {
  IMFMediaType *current = NULL;
  if (!set_output(reader, FIRST_AUDIO, &MFMediaType_Audio, &MFAudioFormat_PCM, 16)) return 0;
  if (FAILED(IMFSourceReader_GetCurrentMediaType(reader, FIRST_AUDIO, &current))) return 0;
  IMFMediaType_GetUINT32(current, &MF_MT_AUDIO_SAMPLES_PER_SECOND, rate);
  IMFMediaType_GetUINT32(current, &MF_MT_AUDIO_NUM_CHANNELS, channels);
  IMFMediaType_Release(current);
  return *rate > 0 && *channels > 0;
}

static double duration_of(IMFSourceReader *reader) {
  PROPVARIANT value;
  PropVariantInit(&value);
  double seconds = 0;
  if (SUCCEEDED(IMFSourceReader_GetPresentationAttribute(reader, (DWORD)MF_SOURCE_READER_MEDIASOURCE,
                                                         &MF_PD_DURATION, &value))) {
    seconds = (double)value.uhVal.QuadPart / 1e7;
    PropVariantClear(&value);
  }
  return seconds;
}

static int cmd_info(const wchar_t *path) {
  IMFSourceReader *reader = open_reader(path);
  if (!reader) return fail("the system cannot open this file");
  int video_present = has_stream(reader, FIRST_VIDEO);
  int audio_present = has_stream(reader, FIRST_AUDIO);
  Picture picture;
  int video = video_present && describe_video(reader, &picture);
  UINT32 rate = 0, channels = 0;
  int audio = audio_present && describe_audio(reader, &rate, &channels);
  printf("{\"duration\":%.6f,\"video\":", duration_of(reader));
  if (video)
    printf("{\"width\":%u,\"height\":%u,\"fps\":\"%u/%u\",\"rotation\":%u}", picture.w, picture.h,
           picture.fps_num, picture.fps_den, picture.rotation);
  else
    printf("null");
  printf(",\"audio\":");
  if (audio)
    printf("{\"sampleRate\":%u,\"channels\":%u}", rate, channels);
  else
    printf("null");
  printf(",\"unreadable\":[");
  int comma = 0;
  if (video_present && !video) printf("\"video\""), comma = 1;
  if (audio_present && !audio) printf("%s\"audio\"", comma ? "," : "");
  printf("]}\n");
  IMFSourceReader_Release(reader);
  return 0;
}

static void put32(unsigned char *at, uint32_t value) {
  at[0] = (unsigned char)value;
  at[1] = (unsigned char)(value >> 8);
  at[2] = (unsigned char)(value >> 16);
  at[3] = (unsigned char)(value >> 24);
}

static void wav_header(unsigned char header[44], UINT32 rate, UINT32 channels, uint32_t data) {
  memcpy(header, "RIFF", 4);
  put32(header + 4, 36 + data);
  memcpy(header + 8, "WAVEfmt ", 8);
  put32(header + 16, 16);
  header[20] = 1, header[21] = 0; /* PCM */
  header[22] = (unsigned char)channels, header[23] = 0;
  put32(header + 24, rate);
  put32(header + 28, rate * channels * 2);
  header[32] = (unsigned char)(channels * 2), header[33] = 0;
  header[34] = 16, header[35] = 0;
  memcpy(header + 36, "data", 4);
  put32(header + 40, data);
}

static int cmd_audio(const wchar_t *path, const wchar_t *out) {
  IMFSourceReader *reader = open_reader(path);
  if (!reader) return fail("the system cannot open this file");
  IMFSourceReader_SetStreamSelection(reader, ALL_STREAMS, FALSE);
  IMFSourceReader_SetStreamSelection(reader, FIRST_AUDIO, TRUE);
  UINT32 rate = 0, channels = 0;
  if (!describe_audio(reader, &rate, &channels)) return fail("the system cannot decode this sound");
  FILE *file = _wfopen(out, L"wb");
  if (!file) return fail("cannot write the sound file");
  unsigned char header[44];
  wav_header(header, rate, channels, 0);
  fwrite(header, 1, sizeof header, file);
  uint64_t written = 0;
  for (;;) {
    DWORD flags = 0;
    LONGLONG time = 0;
    IMFSample *sample = NULL;
    if (FAILED(IMFSourceReader_ReadSample(reader, FIRST_AUDIO, 0, NULL, &flags, &time, &sample)))
      return fail("the sound could not be decoded");
    if (sample) {
      IMFMediaBuffer *buffer = NULL;
      if (SUCCEEDED(IMFSample_ConvertToContiguousBuffer(sample, &buffer))) {
        BYTE *data = NULL;
        DWORD length = 0;
        if (SUCCEEDED(IMFMediaBuffer_Lock(buffer, &data, NULL, &length))) {
          fwrite(data, 1, length, file);
          written += length;
          IMFMediaBuffer_Unlock(buffer);
        }
        IMFMediaBuffer_Release(buffer);
      }
      IMFSample_Release(sample);
    }
    if (flags & MF_SOURCE_READERF_ENDOFSTREAM) break;
  }
  wav_header(header, rate, channels, written > 0xFFFFFFDBu ? 0xFFFFFFDBu : (uint32_t)written);
  fseek(file, 0, SEEK_SET);
  fwrite(header, 1, sizeof header, file);
  fclose(file);
  IMFSourceReader_Release(reader);
  return 0;
}

/*
 * The decoder's frames are often taller than the picture (36 rows in a 48-row
 * buffer, say): it says so by changing the output type after the first frame.
 * Read the buffer's size, and where the picture is in it, again.
 */
static void refresh_layout(IMFSourceReader *reader, Picture *p) {
  IMFMediaType *current = NULL;
  UINT64 packed = 0;
  if (FAILED(IMFSourceReader_GetCurrentMediaType(reader, FIRST_VIDEO, &current))) return;
  if (SUCCEEDED(IMFMediaType_GetUINT64(current, &MF_MT_FRAME_SIZE, &packed))) {
    p->alloc_w = (UINT32)(packed >> 32);
    p->alloc_h = (UINT32)packed;
  }
  MFVideoArea area;
  UINT32 size = 0;
  if (SUCCEEDED(IMFMediaType_GetBlob(current, &MF_MT_MINIMUM_DISPLAY_APERTURE, (UINT8 *)&area,
                                      sizeof area, &size)) &&
      size == sizeof area) {
    p->x = (UINT32)area.OffsetX.value;
    p->y = (UINT32)area.OffsetY.value;
  }
  IMFMediaType_Release(current);
}

/* One decoded NV12 frame, cut to the picture and turned into I420. */
static int to_i420(IMFSample *sample, const Picture *p, unsigned char *out) {
  IMFMediaBuffer *buffer = NULL;
  IMF2DBuffer *buffer2d = NULL;
  BYTE *scan0 = NULL;
  LONG pitch = 0;
  DWORD length = 0;
  int locked2d = 0, ok = 0;
  if (FAILED(IMFSample_ConvertToContiguousBuffer(sample, &buffer))) return 0;
  if (SUCCEEDED(IMFMediaBuffer_QueryInterface(buffer, &IID_IMF2DBuffer, (void **)&buffer2d)) &&
      SUCCEEDED(IMF2DBuffer_Lock2D(buffer2d, &scan0, &pitch))) {
    locked2d = 1;
    IMF2DBuffer_GetContiguousLength(buffer2d, &length);
  } else if (SUCCEEDED(IMFMediaBuffer_Lock(buffer, &scan0, NULL, &length))) {
    pitch = (LONG)p->alloc_w;
  } else {
    goto done;
  }
  /* The luma plane's height in the buffer: from its length (luma plus half again of chroma). */
  UINT32 rows = p->alloc_h;
  if (pitch > 0 && length >= (DWORD)pitch * 3) {
    UINT32 from_length = (UINT32)(length / (DWORD)pitch * 2 / 3);
    if (from_length >= p->y + p->h) rows = from_length;
  }
  if (pitch > 0 && rows >= p->y + p->h) {
    const BYTE *luma = scan0;
    const BYTE *chroma = scan0 + (size_t)pitch * rows;
    unsigned char *y = out, *u = out + (size_t)p->w * p->h, *v = u + (size_t)p->w * p->h / 4;
    for (UINT32 row = 0; row < p->h; row++)
      memcpy(y + (size_t)row * p->w, luma + (size_t)(row + p->y) * pitch + p->x, p->w);
    for (UINT32 row = 0; row < p->h / 2; row++) {
      const BYTE *line = chroma + (size_t)(row + p->y / 2) * pitch + (p->x & ~1u);
      for (UINT32 col = 0; col < p->w / 2; col++) {
        u[(size_t)row * (p->w / 2) + col] = line[col * 2];
        v[(size_t)row * (p->w / 2) + col] = line[col * 2 + 1];
      }
    }
    ok = 1;
  }
  if (locked2d)
    IMF2DBuffer_Unlock2D(buffer2d);
  else
    IMFMediaBuffer_Unlock(buffer);
done:
  if (buffer2d) IMF2DBuffer_Release(buffer2d);
  IMFMediaBuffer_Release(buffer);
  return ok;
}

static int put_frame(const unsigned char *frame, size_t size) {
  return fwrite("FRAME\n", 1, 6, stdout) == 6 && fwrite(frame, 1, size, stdout) == size;
}

static int cmd_video(const wchar_t *path) {
  IMFSourceReader *reader = open_reader(path);
  if (!reader) return fail("the system cannot open this file");
  IMFSourceReader_SetStreamSelection(reader, ALL_STREAMS, FALSE);
  IMFSourceReader_SetStreamSelection(reader, FIRST_VIDEO, TRUE);
  Picture p;
  if (!describe_video(reader, &p)) return fail("the system cannot decode this picture");
  _setmode(_fileno(stdout), _O_BINARY);
  printf("YUV4MPEG2 W%u H%u F%u:%u Ip A1:1 C420jpeg\n", p.w, p.h, p.fps_num, p.fps_den);
  size_t size = (size_t)p.w * p.h * 3 / 2;
  unsigned char *latest = malloc(size);
  if (!latest) return fail("out of memory");
  /* A constant rate: each frame time shows the latest frame decoded by then. */
  const double frame = (double)p.fps_den / p.fps_num;
  long long next = 0;
  int have = 0;
  double end = 0;
  for (;;) {
    DWORD flags = 0;
    LONGLONG time = 0;
    IMFSample *sample = NULL;
    if (FAILED(IMFSourceReader_ReadSample(reader, FIRST_VIDEO, 0, NULL, &flags, &time, &sample)))
      return fail("the picture could not be decoded");
    if (flags & MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED) refresh_layout(reader, &p);
    if (sample) {
      double at = (double)time / 1e7;
      LONGLONG length = 0;
      IMFSample_GetSampleDuration(sample, &length);
      if (at + (double)length / 1e7 > end) end = at + (double)length / 1e7;
      if (have) {
        while (next * frame < at - 1e-6) {
          if (!put_frame(latest, size)) return fail("the output was closed");
          next++;
        }
      }
      if (to_i420(sample, &p, latest)) have = 1;
      IMFSample_Release(sample);
    }
    if (flags & MF_SOURCE_READERF_ENDOFSTREAM) break;
  }
  if (!have) return fail("no picture was decoded");
  do {
    if (!put_frame(latest, size)) return fail("the output was closed");
    next++;
  } while (next * frame < end - 1e-6);
  fflush(stdout);
  free(latest);
  IMFSourceReader_Release(reader);
  return 0;
}

int wmain(int argc, wchar_t **argv) {
  if (argc < 3) return fail("usage: vo-decode info|audio|video <file> [out.wav]");
  if (FAILED(CoInitializeEx(NULL, COINIT_MULTITHREADED)) || FAILED(MFStartup(MF_VERSION, 0)))
    return fail("Media Foundation is not available (a Windows N edition needs the Media Feature Pack)");
  int status;
  if (wcscmp(argv[1], L"info") == 0)
    status = cmd_info(argv[2]);
  else if (wcscmp(argv[1], L"audio") == 0 && argc >= 4)
    status = cmd_audio(argv[2], argv[3]);
  else if (wcscmp(argv[1], L"video") == 0)
    status = cmd_video(argv[2]);
  else
    status = fail("usage: vo-decode info|audio|video <file> [out.wav]");
  MFShutdown();
  CoUninitialize();
  return status;
}

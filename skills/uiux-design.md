# UI/UX Design for eLearning Tools

## Overview
This skill covers UI/UX design principles for creating intuitive eLearning authoring tools.

## Design Principles

### 1. Simplicity
- Minimal learning curve
- Intuitive interface
- Progressive disclosure

### 2. Consistency
- Consistent color scheme
- Standardized icons
- Uniform spacing and typography

### 3. Feedback
- Visual feedback for actions
- Loading indicators
- Success/error messages

### 4. Accessibility
- WCAG 2.1 compliance
- Keyboard navigation
- Screen reader support

## Color Scheme
```
Primary: #2563EB (Blue)
Secondary: #10B981 (Green)
Accent: #F59E0B (Yellow)
Error: #EF4444 (Red)
Background: #F9FAFB (Light Gray)
Text: #1F2937 (Dark Gray)
```

## Typography
```
Headings: Inter, sans-serif
Body: Inter, sans-serif
Code: JetBrains Mono, monospace
```

## Component Library

### 1. Navigation
- Sidebar navigation
- Breadcrumbs
- Tab navigation

### 2. Forms
- Input fields
- Dropdowns
- Checkboxes/Radio buttons
- File uploads

### 3. Buttons
- Primary button
- Secondary button
- Icon buttons
- Loading states

### 4. Modals
- Confirmation dialogs
- Form modals
- Alert dialogs

### 5. Content Blocks
- Text editor
- Image uploader
- Video embed
- Interactive elements

## Layout Patterns

### Dashboard
```
+-------------------+-------------------+
|                   |                   |
|    Sidebar        |    Main Content   |
|                   |                   |
|    - Course List  |    - Editor       |
|    - Templates    |    - Preview      |
|    - Settings     |    - Properties   |
|                   |                   |
+-------------------+-------------------+
```

### Editor Layout
```
+-------------------+-------------------+
|                   |                   |
|    Toolbar        |    Properties     |
|                   |    Panel          |
|    - Insert       |                   |
|    - Format       |    - Style        |
|    - Actions      |    - Settings     |
|                   |                   |
+-------------------+-------------------+
|                                       |
|            Canvas Area                |
|                                       |
|    - Drag & Drop                      |
|    - Inline Editing                   |
|    - Preview                          |
|                                       |
+---------------------------------------+
```

## User Flow
1. **Create Course** → Set title, description
2. **Add Content** → Drag content blocks
3. **Design Interactions** → Add quizzes, scenarios
4. **Preview** → Test the course
5. **Export** → SCORM/xAPI package

## Tools
- **Figma**: Design prototyping
- **Adobe XD**: UI/UX design
- **Storybook**: Component documentation
- **Tailwind CSS**: Utility-first CSS
- **Framer Motion**: Animations
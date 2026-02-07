# Intel HEX Merger Tool

A simple, client-side web tool to merge two Intel HEX files (e.g., merging a Bootloader and an Application firmware) directly in your browser.

## Features

- **100% Client-Side**: No data is uploaded to any server. All processing happens in your browser.
- **32-bit Address Support**: Correctly handles Intel HEX Extended Linear Address (Record Type 04) for firmware larger than 64KB.
- **Drag & Drop**: Easy-to-use interface with drag-and-drop support.
- **Overlap Detection**: Automatically detects and warns when memory addresses overlap between the two files.
- **Privacy Safe**: Your proprietary code never leaves your machine.

## How to Use

1.  **Upload Base File**: Drag or click to upload your primary `.hex` file (e.g., Bootloader).
2.  **Upload Overlay File**: Drag or click to upload your secondary `.hex` file (e.g., Application).
3.  **Merge**: Click the "Merge HEX Files" button.
4.  **Download**: The tool will generate a merged file. Click "Download merged.hex" to save it.

### Merge Logic

The tool combines the data from both files. If the two files share the same memory addresses, the data from the **Overlay File (B)** will overwrite the data from the **Base File (A)**.

## Development / Local Usage

1.  Clone or download this repository.
2.  Open `index.html` in any modern web browser (Chrome, Firefox, Edge, Safari).
3.  No server installation required.

## Deployment (GitHub Pages)

To host this tool for free on GitHub:

1.  Create a new repository on GitHub.
2.  Upload `index.html`, `style.css`, and `script.js`.
3.  Go to **Settings** > **Pages**.
4.  Select the `main` branch as the source and click **Save**.
5.  Your tool will be live at `https://<your-username>.github.io/<repo-name>/`.

## License

MIT License - Feel free to use and modify.

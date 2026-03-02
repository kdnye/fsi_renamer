# ai-renamer

`ai-renamer` is a Node.js CLI for renaming files using multimodal LLMs.

It can process:
- Images (`.jpg`, `.jpeg`, `.png`, `.bmp`, `.tif`, `.tiff`)
- Videos (`.mp4`, `.avi`, `.mov`, `.wmv`, `.flv`, `.mkv`, `.webm`)
- Text/code/markup files (many common extensions)
- PDFs (including page-by-page split + rename flow)

## What the app does today

### 1) General AI renaming
For regular files, `ai-renamer` asks your selected model to generate a short filename based on file contents (and extracted video frames for video files).

### 2) PDF logistics classification flow
For PDFs, the current flow is specialized:
- Splits each PDF into individual pages
- Reads embedded page text
- In logistics mode, pages with no extractable text are preserved as `SCANNED_REVIEW*.pdf` for manual handling instead of being dropped
- Classifies each page into one token:
  - `[HWB]PU`
  - `[HWB]MultiModal`
  - `[HWB]ShipperID`
  - `[HWB]AlertManifest`
  - `[HWB]DeliveryReceipt`
  - `[MAWB]MAWB`
  - `IGNORE`
- Extracts barcode/identifier-like values (HWB/MAWB heuristics)
- Builds final filenames from the classification + identifiers when possible
- Saves each page as a renamed PDF and deletes the original source PDF only when every page was confidently handled

If a page/file is classified as `IGNORE`, it is skipped.

## Requirements

- Node.js 18+
- One provider endpoint:
  - [Ollama](https://ollama.com/download) (default)
  - LM Studio (OpenAI-compatible local endpoint)
  - OpenAI-compatible API
- `ffmpeg` for video frame extraction

## Install & run

### Run without installing globally

```bash
npx ai-renamer /path/to/file-or-folder
```

### Or install globally

```bash
npm install -g ai-renamer
ai-renamer /path/to/file-or-folder
```

## Providers

### Ollama (default)

```bash
npx ai-renamer /path --provider=ollama --model=llava:13b
```

Default base URL: `http://127.0.0.1:11434`

### LM Studio

```bash
npx ai-renamer /path --provider=lm-studio
```

Default base URL: `http://127.0.0.1:1234`

### OpenAI-compatible

```bash
npx ai-renamer /path --provider=openai --api-key=OPENAI_API_KEY
```

Default base URL: `https://api.openai.com`

## Important flags

```bash
npx ai-renamer --help
```

Main options:
- `--provider, -p`
- `--api-key, -a`
- `--base-url, -u`
- `--model, -m`
- `--frames, -f` (video frame count)
- `--case, -c` (output filename casing)
- `--chars, -x` (max filename length)
- `--language, -l`
- `--include-subdirectories, -s`
- `--custom-prompt, -r`

Config is persisted in:
- `~/ai-renamer.json`

## Logistics mode notes

Logistics mode is enabled when:
- You set internal `logisticsMode`, or
- Your custom prompt includes the word `logistics`

In logistics mode, model output is strictly validated against allowed tokens. Invalid output is retried once, then a fallback extractor is used; if still invalid, it defaults to `IGNORE`.

For scanned PDFs in logistics mode, the tool now safeguards pages without embedded text by exporting them as `SCANNED_REVIEW*.pdf` and retaining the source PDF if any pages were not confidently processed.

## Supported extensions

The app supports a broad set of text/code/web/data/script formats plus images, videos, and PDFs. See `src/supportedExtensions.js` for the canonical list.

## Case styles

Case conversion uses [`change-case`](https://www.npmjs.com/package/change-case).

## License

GPL-3.0

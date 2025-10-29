import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
const pdfPoppler = require('pdf-poppler');

const execAsync = promisify(exec);

@Injectable()
export class CdnService {
  private uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
  private processedDir = path.join(process.cwd(), process.env.PROCESSED_DIR || 'processed');

  private tesseractConfig = {
    lang: 'eng+pol',
    oem: 3,
    psm: 12,
  };

  async saveFile(data: { filename: string; content: Buffer }) {
    await fs.mkdir(this.uploadDir, { recursive: true });
    await fs.mkdir(this.processedDir, { recursive: true });

    const filePath = path.join(this.uploadDir, data.filename);
    await fs.writeFile(filePath, data.content);

    const ext = path.extname(data.filename).toLowerCase();

    if (ext === '.pdf') {
      return this.processPdfHybrid(filePath);
    } else if (['.jpg', '.jpeg', '.png', '.tiff'].includes(ext)) {
      return this.processImage(filePath);
    }

    return { message: 'File saved successfully', path: filePath };
  }

  private async processPdfHybrid(pdfPath: string) {
    const baseName = path.basename(pdfPath, '.pdf');
    const txtPath = path.join(this.processedDir, `${baseName}.txt`);

    try {
      // Use pdftotext with UTF-8 encoding
      await execAsync(`pdftotext -layout -enc UTF-8 "${pdfPath}" "${txtPath}"`);
      const text = (await fs.readFile(txtPath, 'utf8')).trim();

      // If text is too short, fallback to OCR
      if (!text || text.length < 10) {
        console.warn('Selectable PDF seems empty → falling back to OCR');
        return this.processPdf(pdfPath);
      }

      return { message: 'Selectable PDF processed', textFile: txtPath, textContent: text };
    } catch (err) {
      console.warn('pdftotext failed → falling back to OCR:', err.message);
      return this.processPdf(pdfPath);
    }
  }

  private async processPdf(pdfPath: string) {
    const outputDir = path.dirname(pdfPath);
    const baseName = path.basename(pdfPath, path.extname(pdfPath));

    const opts = { format: 'png', out_dir: outputDir, out_prefix: baseName, page: null, dpi: 300 };
    await pdfPoppler.convert(pdfPath, opts);

    const files = await fs.readdir(outputDir);
    const imageFiles = files.filter(f => f.startsWith(baseName) && f.toLowerCase().endsWith('.png')).sort();

    let fullText = '';
    for (const img of imageFiles) {
      const imgPath = path.join(outputDir, img);
      const text = await require('node-tesseract-ocr').recognize(imgPath, this.tesseractConfig);
      fullText += text + '\n';
    }

    const txtPath = path.join(this.processedDir, `${baseName}.txt`);
    await fs.writeFile(txtPath, fullText, 'utf8');

    // Clean up temporary images
    for (const img of imageFiles) {
      await fs.unlink(path.join(outputDir, img));
    }

    return { message: 'Scanned PDF processed with OCR', textFile: txtPath, textContent: fullText };
  }

  private async processImage(imagePath: string) {
    const baseName = path.basename(imagePath, path.extname(imagePath));
    const text = await require('node-tesseract-ocr').recognize(imagePath, this.tesseractConfig);
    const txtPath = path.join(this.processedDir, `${baseName}.txt`);
    await fs.writeFile(txtPath, text, 'utf8');

    return { message: 'Image processed', textFile: txtPath, textContent: text };
  }
}

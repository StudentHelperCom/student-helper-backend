import { Injectable, BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

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

    // Sanitize filename before saving
    const sanitizedFilename = this.sanitizeFilename(data.filename);
    const filePath = path.join(this.uploadDir, sanitizedFilename);
    await fs.writeFile(filePath, data.content);

    const ext = path.extname(sanitizedFilename).toLowerCase();

    if (ext === '.pdf') {
      return this.processPdfHybrid(filePath, sanitizedFilename);
    } else if (['.jpg', '.jpeg', '.png', '.tiff'].includes(ext)) {
      return this.processImage(filePath, sanitizedFilename);
    }

    return { 
      message: 'File saved successfully', 
      path: filePath,
      filename: sanitizedFilename 
    };
  }

  private sanitizeFilename(filename: string): string {
    // Remove special characters and keep only safe characters
    const baseName = path.basename(filename, path.extname(filename));
    const ext = path.extname(filename);
    
    const safeName = baseName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-zA-Z0-9_-]/g, '_') // Replace special chars with underscore
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .substring(0, 100); // Limit length
    
    return safeName + ext.toLowerCase();
  }

  private async processPdfHybrid(pdfPath: string, originalFilename: string) {
    const baseName = path.basename(originalFilename, '.pdf');
    const txtPath = path.join(this.processedDir, `${baseName}.txt`);

    try {
      // Use pdftotext with UTF-8 encoding and safe paths
      await execAsync(`pdftotext -layout -enc UTF-8 "${pdfPath}" "${txtPath}"`);
      const text = (await fs.readFile(txtPath, 'utf8')).trim();

      // If text is too short, fallback to OCR
      if (!text || text.length < 10) {
        console.warn('Selectable PDF seems empty → falling back to OCR');
        return this.processPdfWithOCR(pdfPath, originalFilename);
      }

      return { 
        message: 'Selectable PDF processed', 
        textFile: txtPath, 
        textContent: text,
        filename: originalFilename 
      };
    } catch (err) {
      console.warn('pdftotext failed → falling back to OCR:', err.message);
      return this.processPdfWithOCR(pdfPath, originalFilename);
    }
  }

  private async processPdfWithOCR(pdfPath: string, originalFilename: string) {
    const outputDir = this.uploadDir; // Use upload dir for temp files
    const baseName = path.basename(originalFilename, '.pdf');

    try {
      // Use direct poppler commands instead of pdf-poppler package
      const popplerPath = path.join(process.cwd(), 'node_modules', 'pdf-poppler', 'lib', 'win', 'poppler-0.51', 'bin');
      const pdftocairo = path.join(popplerPath, 'pdftocairo.exe');
      
      // Convert PDF to images using pdftocairo
      const outputPrefix = path.join(outputDir, baseName);
      const command = `"${pdftocairo}" -png -r 150 "${pdfPath}" "${outputPrefix}"`;
      
      await execAsync(command);

      // Find generated images
      const files = await fs.readdir(outputDir);
      const imageFiles = files.filter(f => 
        f.startsWith(baseName) && f.endsWith('.png')
      ).sort();

      let fullText = '';
      const tesseract = await import('node-tesseract-ocr');
      
      for (const imgFile of imageFiles) {
        const imgPath = path.join(outputDir, imgFile);
        const text = await tesseract.recognize(imgPath, this.tesseractConfig);
        fullText += text + '\n\n';
        
        // Clean up temporary image
        await fs.unlink(imgPath);
      }

      const txtPath = path.join(this.processedDir, `${baseName}.txt`);
      await fs.writeFile(txtPath, fullText, 'utf8');

      return { 
        message: 'Scanned PDF processed with OCR', 
        textFile: txtPath, 
        textContent: fullText,
        filename: originalFilename 
      };

    } catch (error) {
      console.error('PDF OCR processing failed:', error);
      throw new BadRequestException(`PDF processing failed: ${error.message}`);
    }
  }

  private async processImage(imagePath: string, originalFilename: string) {
    const baseName = path.basename(originalFilename, path.extname(originalFilename));
    
    try {
      const tesseract = await import('node-tesseract-ocr');
      const text = await tesseract.recognize(imagePath, this.tesseractConfig);
      
      const txtPath = path.join(this.processedDir, `${baseName}.txt`);
      await fs.writeFile(txtPath, text, 'utf8');

      return { 
        message: 'Image processed', 
        textFile: txtPath, 
        textContent: text,
        filename: originalFilename 
      };
    } catch (error) {
      console.error('Image OCR processing failed:', error);
      throw new BadRequestException(`Image processing failed: ${error.message}`);
    }
  }
}
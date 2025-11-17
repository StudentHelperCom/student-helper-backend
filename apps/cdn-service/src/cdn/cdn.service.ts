import { Injectable, BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Poppler } from 'node-poppler';
import * as dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

@Injectable()
export class CdnService {
    private uploadDir = path.join(process.cwd(), 'uploads');
    private processedDir = path.join(process.cwd(), 'processed');
    private poppler: Poppler;

    private tesseractConfig = {
        lang: 'eng+pol',
        oem: 3,
        psm: 12,
    };

    private s3 = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
    });

    private bucket = process.env.AWS_S3_BUCKET!;

    constructor() {
        this.poppler = new Poppler(); 
    }

    async saveFile(data: { filename: string; content: Buffer }) {
        await fs.mkdir(this.uploadDir, { recursive: true });
        await fs.mkdir(this.processedDir, { recursive: true });

        const sanitizedFilename = this.sanitizeFilename(data.filename);
        const localPath = path.join(this.uploadDir, sanitizedFilename);

        await fs.writeFile(localPath, data.content);

        const ext = path.extname(sanitizedFilename).toLowerCase();

        let result;
        if (ext === '.pdf') {
            result = await this.processPdfHybrid(localPath, sanitizedFilename);
        } else if (['.jpg', '.jpeg', '.png', '.tiff'].includes(ext)) {
            result = await this.processImage(localPath, sanitizedFilename);
        } else {
            result = { message: 'File saved successfully', filename: sanitizedFilename };
        }

        await this.uploadToS3(`uploads/${sanitizedFilename}`, data.content);

        if (result.textFile) {
            const textContent = await fs.readFile(result.textFile, 'utf8');
            const s3TextKey = `processed/${path.basename(result.textFile)}`;
            await this.uploadToS3(s3TextKey, Buffer.from(textContent, 'utf8'));
            result.s3TextUrl = this.getPublicUrl(s3TextKey);
        }

        result.s3OriginalUrl = this.getPublicUrl(`uploads/${sanitizedFilename}`);
        return result;
    }

    private sanitizeFilename(filename: string): string {
        const baseName = path.basename(filename, path.extname(filename));
        const ext = path.extname(filename);
        const safeName = baseName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 100);
        return safeName + ext.toLowerCase();
    }

    private async uploadToS3(key: string, content: Buffer) {
        await this.s3.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: content,
                ContentType: this.getMimeType(key),
            }),
        );
    }

    private getPublicUrl(key: string) {
        return `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    }

    private getMimeType(key: string): string {
        const ext = path.extname(key).toLowerCase();
        if (ext === '.pdf') return 'application/pdf';
        if (ext === '.txt') return 'text/plain';
        if (ext === '.png') return 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
        return 'application/octet-stream';
    }

    private async processPdfHybrid(pdfPath: string, originalFilename: string) {
        const baseName = path.basename(originalFilename, '.pdf');
        const txtPath = path.join(this.processedDir, `${baseName}.txt`);

        try {
            await this.poppler.pdfToText(pdfPath, txtPath);

            const text = (await fs.readFile(txtPath, 'utf8')).trim();

            if (!text || text.length < 10) {
                console.warn('Empty PDF → fallback to OCR');
                return this.processPdfWithOCR(pdfPath, originalFilename);
            }

            return { 
                message: 'Selectable PDF processed', 
                textFile: txtPath, 
                textContent: text,
                filename: originalFilename 
            };
        } catch (err) {
            console.warn('pdftotext failed → fallback to OCR:', err.message);
            await fs.unlink(txtPath).catch(() => {});
            return this.processPdfWithOCR(pdfPath, originalFilename);
        }
    }

    private async processPdfWithOCR(pdfPath: string, originalFilename: string) {
        const outputDir = this.uploadDir;
        const baseName = path.basename(originalFilename, '.pdf');

        try {
            const outputPrefix = path.join(outputDir, baseName);
            
            const options = {
                pngFile: true,

            };
            await this.poppler.pdfToCairo(pdfPath, outputPrefix, options);

            const files = await fs.readdir(outputDir);
            const imageFiles = files.filter(f => f.startsWith(baseName) && f.endsWith('.png')).sort();

            const tesseract = await import('node-tesseract-ocr');
            let fullText = '';

            for (const imgFile of imageFiles) {
                const imgPath = path.join(outputDir, imgFile);
                const text = await tesseract.recognize(imgPath, this.tesseractConfig);
                fullText += text + '\n\n';
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
            return { message: 'Image processed', textFile: txtPath, textContent: text, filename: originalFilename };
        } catch (error) {
            console.error('Image OCR processing failed:', error);
            throw new BadRequestException(`Image processing failed: ${error.message}`);
        }
    }
}
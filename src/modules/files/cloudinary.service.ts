import { createHash } from 'node:crypto';
import { HttpService } from '@nestjs/axios';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { env } from '../../config/env';

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
  uploadUrl: string;
}

/**
 * Firma peticiones de subida directa a Cloudinary (signed direct upload) usando crypto de Node.
 * El navegador sube los bytes directo a Cloudinary; el backend nunca los proxea.
 */
@Injectable()
export class CloudinaryService {
  constructor(private readonly http: HttpService) {}

  get isConfigured(): boolean {
    return Boolean(
      env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
    );
  }

  private assertConfigured(): void {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException({
        code: 'CLOUDINARY_NOT_CONFIGURED',
        message: 'El almacenamiento de archivos (Cloudinary) no está configurado en el backend.',
      });
    }
  }

  private sign(params: Record<string, string | number>): string {
    const toSign = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');
    return createHash('sha1')
      .update(`${toSign}${env.CLOUDINARY_API_SECRET ?? ''}`)
      .digest('hex');
  }

  buildUploadSignature(folder: string): UploadSignature {
    this.assertConfigured();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign({ folder, timestamp });
    return {
      cloudName: env.CLOUDINARY_CLOUD_NAME as string,
      apiKey: env.CLOUDINARY_API_KEY as string,
      timestamp,
      folder,
      signature,
      uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
    };
  }

  async destroy(publicId: string, resourceType = 'image'): Promise<void> {
    this.assertConfigured();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign({ public_id: publicId, timestamp });
    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: env.CLOUDINARY_API_KEY as string,
      signature,
    });
    const url = `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`;
    await firstValueFrom(
      this.http.post(url, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
  }
}

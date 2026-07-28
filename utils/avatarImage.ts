export const resizeAvatarImage = (file: File) => new Promise<Blob>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) {
            reject(new Error('Không thể xử lý ảnh avatar.'));
            return;
        }

        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
        const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);

        context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Không thể nén ảnh avatar.'));
                return;
            }
            resolve(blob);
        }, 'image/webp', 0.78);
    };

    image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('File ảnh không hợp lệ.'));
    };

    image.src = objectUrl;
});

export const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('Không thể đọc ảnh avatar.'));
    reader.readAsDataURL(blob);
});

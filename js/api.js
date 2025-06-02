import { API_URL } from './config.js';

// 파일 업로드 함수
async function uploadAudio(formData) {
    try {
        const response = await fetch(`${API_URL}/api/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'アップロードに失敗しました');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

// 예약 조회 함수
async function getReservation(key) {
    try {
        const response = await fetch(`${API_URL}/api/reservations?key=${key}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || '予約情報の取得に失敗しました');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

export { uploadAudio, getReservation }; 
const express = require('express');
const multer = require('multer');
const aws = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const Album = require('./models/Album');

const router = express.Router();

// S3 설정
const s3 = new aws.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

// Multer 메모리 저장소
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB 제한
        files: 1 // 단일 파일만 허용
    }
});

// 오디오 업로드 및 예약 생성
router.post('/', upload.single('audio'), async(req, res) => {
    try {
        if (!req.file) {
            console.log('❌ 오디오 파일이 없습니다.');
            return res.status(400).json({ message: '오디오 파일이 필요합니다.' });
        }

        const {
            name,
            age,
            gender,
            email,
            date,
            time,
            mainRequest,
            note,
            memberKey
        } = req.body;

        // 필수 필드 검증
        if (!name || !age || !gender || !email || !date || !time || !memberKey) {
            return res.status(400).json({ message: '모든 필수 항목을 입력해주세요.' });
        }

        // 파일 이름 생성
        const filename = `${uuidv4()}_${req.file.originalname}`;
        const s3Params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `audio/${filename}`,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        // S3에 파일 업로드
        const s3Upload = await s3.upload(s3Params).promise();

        // 예약 정보 생성
        const newAlbum = new Album({
            name,
            age: Number(age),
            gender,
            email,
            date: new Date(date),
            albumLength: time,
            albumDescription: mainRequest,
            note,
            reservationCode: memberKey,
            audioUrl: s3Upload.Location,
            status: '처리중',
            createdAt: new Date()
        });

        await newAlbum.save();

        res.status(200).json({ 
            message: '예약이 완료되었습니다.',
            reservationCode: memberKey,
            audioUrl: s3Upload.Location 
        });
    } catch (err) {
        console.error('❌ 예약 생성 실패:', JSON.stringify(err, null, 2));
        res.status(500).json({ message: '예약 생성 실패', error: err.message });
    }
});

// 예약 삭제
router.delete('/:id', async(req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) {
            return res.status(404).json({ message: '예약을 찾을 수 없습니다.' });
        }

        // S3에서 파일 삭제
        if (album.audioUrl) {
            const key = album.audioUrl.split('/').pop();
            const s3Params = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `audio/${key}`
            };

            await s3.deleteObject(s3Params).promise();
        }

        await Album.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: '예약이 삭제되었습니다.' });
    } catch (err) {
        console.error('❌ 예약 삭제 실패:', err);
        res.status(500).json({ message: '예약 삭제 실패', error: err.message });
    }
});

// 오디오 파일 다운로드
router.get('/download/:id', async(req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album || !album.audioUrl) {
            return res.status(404).json({ message: '파일을 찾을 수 없습니다.' });
        }

        const key = decodeURIComponent(album.audioUrl.split('/').slice(-1)[0]);
        const filename = key.split('_').slice(1).join('_'); // UUID 제거

        const s3Params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `audio/${key}`,
        };

        // S3에서 파일 스트리밍
        const s3Stream = s3.getObject(s3Params).createReadStream();
        
        // 응답 헤더 설정
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'audio/mpeg');
        
        // 파일 스트리밍
        s3Stream.pipe(res);
        
        // 에러 처리
        s3Stream.on('error', (err) => {
            console.error('❌ 스트리밍 오류:', err);
            if (!res.headersSent) {
                res.status(500).json({ message: '다운로드 실패', error: err.message });
            }
        });
    } catch (err) {
        console.error('❌ 다운로드 실패:', err);
        res.status(500).json({ message: '다운로드 실패', error: err.message });
    }
});

module.exports = router; 
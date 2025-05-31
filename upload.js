const express = require('express');
const multer = require('multer');
const aws = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const Album = require('./models/Album');

const router = express.Router();

// ✅ S3 설정
const s3 = new aws.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

// ✅ Multer 메모리 저장소 설정
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ 오디오 업로드 및 DB 저장 라우터
router.post('/', upload.single('audio'), async(req, res) => {
    try {
        if (!req.file) {
            console.log('❌ 업로드된 오디오 파일이 없습니다.');
            return res.status(400).json({ message: '파일이 없습니다.' });
        }

        const {
            name,
            age,
            gender,
            email,
            date,
            time, // ← 사용자가 입력한 시간
            mainRequest, // ← 사용자가 입력한 요청사항
            note,
            memberKey
        } = req.body;

        // S3에 업로드할 파일 이름 설정
        const filename = `${uuidv4()}_${req.file.originalname}`;
        const s3Params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `audio/${filename}`,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        // S3에 업로드
        const s3Upload = await s3.upload(s3Params).promise();
        console.log('✅ S3 업로드 성공:', s3Upload.Location);

        // MongoDB에 저장
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
        });

        await newAlbum.save();
        console.log('✅ MongoDB 저장 성공:', newAlbum._id);

        res.status(200).json({ message: '저장 완료', url: s3Upload.Location });
    } catch (err) {
        console.error('❌ 업로드 처리 중 오류:', JSON.stringify(err, null, 2));
        res.status(500).json({ message: '예약 생성 실패', error: err.message });
    }
});

// ✅ 예약 삭제 라우터
router.delete('/:id', async(req, res) => {
    try {
        await Album.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: '삭제 완료' });
    } catch (err) {
        console.error('❌ 삭제 실패:', err);
        res.status(500).json({ message: '삭제 실패', error: err.message });
    }
});

// ✅ 다운로드 라우터
router.get('/download/:id', async(req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album || !album.audioUrl) {
            return res.status(404).json({ message: '파일이 없습니다.' });
        }

        const key = decodeURIComponent(album.audioUrl.split('/').slice(-1)[0]);
        const filename = key.split('_').slice(1).join('_');

        const s3Params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `audio/${key}`,
        };

        const s3Stream = s3.getObject(s3Params).createReadStream();
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'audio/mpeg');
        s3Stream.pipe(res);

        s3Stream.on('error', (err) => {
            console.error('❌ S3 스트리밍 실패:', err);
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
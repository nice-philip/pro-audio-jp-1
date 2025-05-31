const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const Album = require('./models/Album');

const router = express.Router();

// ✅ S3 설정
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// ✅ Multer 메모리 저장소 설정
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ 오디오 업로드 및 DB 저장 라우터
router.post('/', upload.single('audio'), async(req, res) => {
    try {
        if (!req.file) {
            console.log('❌ 没有上传音频文件');
            return res.status(400).json({ message: '没有文件' });
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
        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `audio/${filename}`,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        // S3에 업로드
        const s3Upload = await s3Client.send(new PutObjectCommand(uploadParams));
        const audioUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/audio/${filename}`;
        console.log('✅ S3上传成功:', audioUrl);

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
            audioUrl,
        });

        await newAlbum.save();
        console.log('✅ MongoDB保存成功:', newAlbum._id);

        res.status(200).json({ message: '保存完成', url: audioUrl });
    } catch (err) {
        console.error('❌ 上传处理错误:', JSON.stringify(err, null, 2));
        res.status(500).json({ message: '预约创建失败', error: err.message });
    }
});

// ✅ 예약 삭제 라우터
router.delete('/:id', async(req, res) => {
    try {
        await Album.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: '删除完成' });
    } catch (err) {
        console.error('❌ 删除失败:', err);
        res.status(500).json({ message: '删除失败', error: err.message });
    }
});

// ✅ 다운로드 라우터
router.get('/download/:id', async(req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album || !album.audioUrl) {
            return res.status(404).json({ message: '文件不存在' });
        }

        const key = decodeURIComponent(album.audioUrl.split('/').slice(-1)[0]);
        const filename = key.split('_').slice(1).join('_');

        const getObjectParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `audio/${key}`,
        };

        const { Body } = await s3Client.send(new GetObjectCommand(getObjectParams));
        
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'audio/mpeg');
        
        Body.pipe(res);

        Body.on('error', (err) => {
            console.error('❌ S3流媒体失败:', err);
            if (!res.headersSent) {
                res.status(500).json({ message: '下载失败', error: err.message });
            }
        });
    } catch (err) {
        console.error('❌ 下载失败:', err);
        res.status(500).json({ message: '下载失败', error: err.message });
    }
});

module.exports = router;
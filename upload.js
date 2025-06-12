const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const Album = require('./models/Album');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

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

const upload = multer({ 
    storage,
    fileFilter: function (req, file, cb) {
        console.log('✅ File upload attempt:', file.fieldname, file.originalname);
        if (file.fieldname === 'albumCover') {
            if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
                return cb(new Error('JPG/PNG 形式の画像のみアップロード可能です。'), false);
            }
        } else if (file.fieldname.startsWith('audio_')) {
            if (!file.originalname.match(/\.(wav)$/)) {
                return cb(new Error('WAV 形式の音声ファイルのみアップロード可能です。'), false);
            }
        }
        cb(null, true);
    },
    limits: {
        fileSize: 2 * 1024 * 1024 * 1024 // 2GB limit for audio files
    }
});

// ✅ 이미지 검증 함수
async function validateImage(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();
        if (metadata.width !== 3000 || metadata.height !== 3000) {
            throw new Error('アルバムカバーは3000x3000ピクセルである必要があります。');
        }
        if (buffer.length > 10 * 1024 * 1024) {
            throw new Error('アルバムカバーは10MB以下である必要があります。');
        }
        return true;
    } catch (error) {
        throw error;
    }
}

// ✅ S3 업로드 함수
async function uploadToS3(file, folder) {
    const filename = `${uuidv4()}_${file.originalname}`;
    const uploadParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${folder}/${filename}`,
        Body: file.buffer,
        ContentType: file.mimetype
    };

    try {
        await s3Client.send(new PutObjectCommand(uploadParams));
        return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${folder}/${filename}`;
    } catch (error) {
        console.error(`❌ S3 upload failed for ${filename}:`, error);
        throw error;
    }
}

// ✅ 앨범 업로드 처리 라우터
router.post('/', upload.fields([
    { name: 'albumCover', maxCount: 1 },
    { name: 'audio_*', maxCount: 1 }
]), async (req, res) => {
    console.log('Upload route accessed');
    console.log('Request headers:', req.headers);
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);

    try {
        // 앨범 커버 검증
        if (!req.files.albumCover) {
            return res.status(400).json({
                message: 'アルバムカバーは必須です',
                code: 'MISSING_COVER'
            });
        }

        // 이미지 검증
        const coverImage = req.files.albumCover[0];
        try {
            await validateImage(coverImage.buffer);
        } catch (error) {
            return res.status(400).json({
                message: error.message,
                code: 'INVALID_IMAGE'
            });
        }

        // 앨범 커버 S3 업로드
        const coverUrl = await uploadToS3(coverImage, 'covers');

        // 곡 정보 처리
        const songs = [];
        const audioFiles = Object.keys(req.files).filter(key => key.startsWith('audio_'));
        
        for (let i = 0; i < audioFiles.length; i++) {
            const audioKey = audioFiles[i];
            const audioFile = req.files[audioKey][0];
            const songIndex = audioKey.split('_')[1];

            // 오디오 파일 S3 업로드
            const audioUrl = await uploadToS3(audioFile, 'audio');
            
            // 곡 정보 구성
            songs.push({
                mainArtists: req.body[`mainArtist_${songIndex}`].split(',').map(item => item.trim()).filter(Boolean),
                participatingArtists: req.body[`participatingArtist_${songIndex}`].split(',').map(item => item.trim()).filter(Boolean),
                featuringArtists: req.body[`featuring_${songIndex}`] ? 
                    req.body[`featuring_${songIndex}`].split(',').map(item => item.trim()).filter(Boolean) : [],
                mixingEngineers: req.body[`mixingEngineer_${songIndex}`].split(',').map(item => item.trim()).filter(Boolean),
                recordingEngineers: req.body[`recordingEngineer_${songIndex}`].split(',').map(item => item.trim()).filter(Boolean),
                producers: req.body[`producer_${songIndex}`].split(',').map(item => item.trim()).filter(Boolean),
                lyricists: req.body[`lyricist_${songIndex}`].split(',').map(item => item.trim()).filter(Boolean),
                composers: req.body[`composer_${songIndex}`].split(',').map(item => item.trim()).filter(Boolean),
                arrangers: req.body[`arranger_${songIndex}`].split(',').map(item => item.trim()).filter(Boolean),
                isRemake: req.body[`isRemake_${songIndex}`] === 'yes',
                usesExternalBeat: req.body[`usesExternalBeat_${songIndex}`] === 'yes',
                language: req.body[`language_${songIndex}`],
                lyrics: req.body[`lyrics_${songIndex}`],
                audioUrl
            });
        }

        // 새 앨범 생성
        const newAlbum = new Album({
            email: req.body.email,
            password: req.body.password, // Note: 실제 구현시 비밀번호 해시 처리 필요
            albumNameDomestic: req.body.albumNameDomestic,
            albumNameInternational: req.body.albumNameInternational,
            artistNameKana: req.body.artistNameKana,
            artistNameEnglish: req.body.artistNameEnglish,
            versionInfo: req.body.versionInfo,
            songs,
            albumCover: coverUrl,
            platforms: Array.isArray(req.body.platforms) ? req.body.platforms : [req.body.platforms],
            excludedCountries: Array.isArray(req.body.excludedCountries) ? req.body.excludedCountries : [],
            genre: req.body.genre,
            youtubeMonetize: req.body.youtubeMonetize === 'yes',
            youtubeAgree: req.body.youtubeAgree === 'true',
            agreements: {
                all: req.body.agreementAll === 'true',
                rights: req.body.rightsAgreement === 'true',
                reRelease: req.body.reReleaseAgreement === 'true',
                platform: req.body.platformAgreement === 'true'
            },
            paymentStatus: 'pending'
        });

        await newAlbum.save();
        console.log('✅ Album saved successfully:', newAlbum._id);

        res.status(200).json({
            message: 'アルバムの申請が完了しました',
            albumId: newAlbum._id,
            coverUrl,
            songs: songs.map(song => ({
                audioUrl: song.audioUrl
            }))
        });

    } catch (error) {
        console.error('❌ Upload process error:', error);
        res.status(500).json({
            message: 'アルバムの申請に失敗しました',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// ✅ 앨범 삭제 라우터
router.delete('/:id', async (req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) {
            return res.status(404).json({ message: 'アルバムが見つかりません' });
        }

        // S3에서 앨범 커버 삭제
        if (album.albumCover) {
            const coverKey = album.albumCover.split('/').pop();
            await s3Client.send(new DeleteObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `covers/${coverKey}`
            }));
        }

        // S3에서 모든 곡 파일 삭제
        for (const song of album.songs) {
            if (song.audioUrl) {
                const audioKey = song.audioUrl.split('/').pop();
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: `audio/${audioKey}`
                }));
            }
        }

        await Album.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'アルバムを削除しました' });
    } catch (error) {
        console.error('❌ Delete process error:', error);
        res.status(500).json({
            message: 'アルバムの削除に失敗しました',
            error: error.message
        });
    }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const multer = require('multer');
const AWS = require('aws-sdk');
const Album = require('../models/Album');
const mongoose = require('mongoose');

// AWS S3 설정
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

// Multer 설정
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB 제한
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// MongoDB 연결
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// 업로드 처리
router.post('/', upload.array('songs', 10), async (req, res) => {
  try {
    console.log('Upload request received');
    console.log('Request body:', req.body);

    // 필수 필드 검증
    const requiredFields = {
      artistNameKana: req.body.nameKana,
      artistNameEnglish: req.body.nameEn,
      versionInfo: req.body.albumTitle // albumTitle을 versionInfo로 사용
    };

    console.log('Required fields:', requiredFields);

    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value || value.trim() === '')
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // 앨범 데이터 생성
    const albumData = {
      artistNameKana: req.body.nameKana,
      artistNameEnglish: req.body.nameEn,
      versionInfo: req.body.albumTitle,
      releaseDate: req.body.releaseDate,
      email: req.body.email,
      password: req.body.password,
      albumNameDomestic: req.body.albumNameDomestic,
      albumNameInternational: req.body.albumNameInternational,
      artistInfo: req.body.artistInfo,
      songs: [],
      platforms: req.body.platforms || [],
      youtubeMonetize: req.body.youtubeMonetize === 'on',
      payLater: req.body.payLater === 'true'
    };

    // 곡 정보 처리
    const songCount = parseInt(req.body.songCount) || 0;
    for (let i = 0; i < songCount; i++) {
      const songData = {
        title: req.body[`title_${i}`],
        titleEn: req.body[`titleEn_${i}`],
        duration: {
          min: parseInt(req.body[`duration_min_${i}`]),
          sec: parseInt(req.body[`duration_sec_${i}`])
        },
        genre: req.body[`genre_${i}`],
        mainArtist: req.body[`mainArtist_${i}`] || [],
        participatingArtist: req.body[`participatingArtist_${i}`] || [],
        featuring: req.body[`featuring_${i}`] || [],
        mixingEngineer: req.body[`mixingEngineer_${i}`] || [],
        recordingEngineer: req.body[`recordingEngineer_${i}`] || [],
        producer: req.body[`producer_${i}`] || [],
        lyricist: req.body[`lyricist_${i}`] || [],
        composer: req.body[`composer_${i}`] || [],
        arranger: req.body[`arranger_${i}`] || [],
        isRemake: req.body[`isRemake_${i}`] === 'yes',
        usesExternalBeat: req.body[`usesExternalBeat_${i}`] === 'yes',
        language: req.body[`language_${i}`],
        lyrics: req.body[`lyrics_${i}`]
      };

      // 곡 파일 업로드 처리
      if (req.files && req.files[i]) {
        const file = req.files[i];
        const params = {
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: `songs/${Date.now()}-${file.originalname}`,
          Body: file.buffer,
          ContentType: file.mimetype
        };

        const uploadResult = await s3.upload(params).promise();
        songData.audioFile = uploadResult.Location;
      }

      albumData.songs.push(songData);
    }

    // 앨범 저장
    const album = new Album(albumData);
    await album.save();

    res.status(200).json({
      message: 'Album uploaded successfully',
      albumId: album._id
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router; 
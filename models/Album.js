const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
    // Basic song information
    title: { type: String, required: true }, // Japanese title
    titleEn: { type: String, required: true }, // English title
    duration: {
        minutes: { type: Number, required: true, min: 0 },
        seconds: { type: Number, required: true, min: 0, max: 59 }
    },
    genre: { 
        type: String, 
        required: true,
        enum: ['rock', 'pop', 'jazz', 'classical', 'electronic', 'hiphop', 'country', 'experimental']
    },
    
    // Artist information
    mainArtist: [{ type: String, required: true }],
    participatingArtist: [{ type: String, required: true }],
    featuring: [{ type: String }],
    mixingEngineer: [{ type: String, required: true }],
    recordingEngineer: [{ type: String, required: true }],
    producer: [{ type: String, required: true }],
    
    // Creator information
    lyricist: [{ type: String, required: true }],
    composer: [{ type: String, required: true }],
    arranger: [{ type: String, required: true }],
    
    // Audio and content information
    audioUrl: { type: String, required: true },
    isRemake: { type: Boolean, default: false },
    usesExternalBeat: { type: Boolean, default: false },
    language: { 
        type: String, 
        required: true,
        enum: [
            'instrumental', 'japanese', 'english', 'korean', 'chinese', 'spanish', 
            'french', 'german', 'italian', 'portuguese', 'russian', 'arabic', 
            'hindi', 'bengali', 'punjabi', 'javanese', 'vietnamese', 'thai', 
            'turkish', 'persian'
        ]
    },
    lyrics: { type: String },
    hasExplicitContent: { type: Boolean, default: false }
});

const albumSchema = new mongoose.Schema({
    // Basic information
    releaseDate: { type: Date, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true },
    albumNameDomestic: { type: String, required: true },
    albumNameInternational: { type: String, required: true },
    artistNameKana: { type: String, required: true },
    artistNameEnglish: { type: String, required: true },
    versionInfo: { type: String, required: true },
    
    // Album content
    songs: [songSchema],
    albumCover: { type: String, required: true },
    
    // Distribution information
    platforms: [{ 
        type: String,
        enum: [
            'spotify', 'apple_music', 'youtube_music', 'amazon_music', 'tidal',
            'deezer', 'pandora', 'soundcloud', 'napster', 'anghami',
            'joox', 'kkbox', 'line_music', 'qq_music', 'netease'
        ]
    }],
    excludedCountries: [{ 
        type: String,
        enum: [
            'JP', 'CN', 'KR', 'TW', 'HK', 'SG', 'MY', 'ID', 'TH', 'VN',
            'PH', 'IN', 'PK', 'BD'
        ]
    }],
    
    // Agreements
    rightsAgreement: { type: Boolean, required: true },
    reReleaseAgreement: { type: Boolean, required: true },
    platformAgreement: { type: Boolean, required: true },
    
    // Payment information
    paymentStatus: { 
        type: String, 
        enum: ['pending', 'completed', 'failed'], 
        default: 'pending' 
    },
    paymentAmount: { type: Number, default: 20000 },
    payLater: { type: Boolean, default: false },
    
    // Timestamps
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Album', albumSchema, 'albums-jp');
const mongoose = require('mongoose');

const AlbumSchema = new mongoose.Schema({
    // User Information
    email: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },

    // Basic Information
    albumNameDomestic: {
        type: String,
        required: true
    },
    albumNameInternational: {
        type: String,
        required: true
    },
    artistNameKana: {
        type: String,
        required: true
    },
    artistNameEnglish: {
        type: String,
        required: true
    },
    versionInfo: {
        type: String,
        required: true
    },
    releaseDate: {
        type: Date,
        required: true,
        validate: {
            validator: function(date) {
                const threeWeeksFromNow = new Date();
                threeWeeksFromNow.setDate(threeWeeksFromNow.getDate() + 21);
                return date >= threeWeeksFromNow;
            },
            message: '発売日は3週間以降の日付を選択してください。'
        }
    },

    // Songs array for multiple songs
    songs: [{
        mainArtists: [{
            type: String,
            required: true
        }],
        participatingArtists: [{
            type: String,
            required: true
        }],
        featuringArtists: [{
            type: String
        }],
        mixingEngineers: [{
            type: String,
            required: true
        }],
        recordingEngineers: [{
            type: String,
            required: true
        }],
        producers: [{
            type: String,
            required: true
        }],
        lyricists: [{
            type: String,
            required: true
        }],
        composers: [{
            type: String,
            required: true
        }],
        arrangers: [{
            type: String,
            required: true
        }],
        isRemake: {
            type: Boolean,
            required: true
        },
        usesExternalBeat: {
            type: Boolean,
            required: true
        },
        language: {
            type: String,
            required: true,
            enum: [
                'instrumental',
                'japanese',
                'english',
                'korean',
                'chinese',
                'spanish',
                'french',
                'german',
                'italian',
                'portuguese',
                'russian',
                'arabic',
                'hindi',
                'bengali',
                'punjabi',
                'javanese',
                'vietnamese',
                'thai',
                'turkish',
                'persian'
            ]
        },
        lyrics: {
            type: String
        },
        audioUrl: {
            type: String,
            required: true
        }
    }],

    // Album Cover
    albumCover: {
        type: String,
        required: true,
        validate: {
            validator: function(value) {
                // Validation will be handled in the upload middleware
                return true;
            },
            message: 'アルバムカバーは3000x3000ピクセル、10MB以下のJPG/PNG形式である必要があります。'
        }
    },

    // Genre
    genre: {
        type: String,
        required: true,
        enum: [
            'pop',
            'rock',
            'jazz',
            'classical',
            'electronic',
            'hiphop',
            'rb',
            'folk',
            'world',
            'ambient',
            'metal',
            'blues',
            'country',
            'experimental',
            'fusion'
        ]
    },

    // Distribution
    platforms: [{
        type: String,
        required: true,
        enum: [
            'spotify',
            'apple_music',
            'youtube_music',
            'amazon_music',
            'tidal',
            'deezer',
            'pandora',
            'soundcloud',
            'napster',
            'anghami',
            'joox',
            'kkbox',
            'line_music',
            'qq_music',
            'netease'
        ]
    }],
    excludedCountries: [{
        type: String,
        enum: [
            'JP', 'CN', 'KR', 'TW', 'HK', 'SG', 'MY', 'ID', 'TH', 'VN',
            'PH', 'IN', 'PK', 'BD', 'LK',
            'GB', 'FR', 'DE', 'IT', 'ES', 'PT', 'NL', 'BE', 'CH', 'AT',
            'SE', 'NO', 'DK', 'FI', 'IE',
            'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC',
            'BO', 'PY', 'UY',
            'AU', 'NZ', 'RU', 'TR', 'ZA', 'EG', 'SA', 'AE', 'IL', 'IR'
        ]
    }],

    // YouTube Monetization
    youtubeMonetize: {
        type: Boolean,
        default: false
    },
    youtubeAgree: {
        type: Boolean,
        default: false
    },

    // Agreements
    agreements: {
        all: {
            type: Boolean,
            required: true
        },
        rights: {
            type: Boolean,
            required: true
        },
        reRelease: {
            type: Boolean,
            required: true
        },
        platform: {
            type: Boolean,
            required: true
        }
    },

    // Payment Status
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },

    // Metadata
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp before saving
AlbumSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Album', AlbumSchema);
const mongoose = require('mongoose');

const AlbumSchema = new mongoose.Schema({
    // Basic Information
    albumNameDomestic: {
        type: String,
        required: true
    },
    albumNameInternational: {
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

    // Artist Information
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

    // Creator Information
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

    // Song Information
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

    // Distribution
    platforms: [{
        type: String,
        required: true,
        enum: ['anghami', 'TIDAL', 'JOOX'] // Add more platforms as needed
    }],
    excludedCountries: [{
        type: String,
        enum: ['JP', 'US', 'CN', 'KR'] // Add more countries as needed
    }],

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
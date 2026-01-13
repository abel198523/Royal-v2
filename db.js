const { Pool } = require('pg');

/**
 * Neon.tech PostgreSQL ግንኙነት
 * * ማሳሰቢያ፡ 'DATABASE_URL' የሚለውን ኢንቫይሮንመንት ቫሪያብል 
 * በ Render Dashboard ላይ በሚሰጥህ የ Neon Connection String መቀየር አለብህ።
 */

const connectionString = process.env.DATABASE_URL || 'YOUR_NEON_CONNECTION_STRING_HERE';

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        // Neon በ SSL ብቻ ስለሚሰራ ይህ ግዴታ ነው
        rejectUnauthorized: false 
    }
});

// የዳታቤዝ ግንኙነቱን መፈተሻ
pool.connect((err, client, release) => {
    if (err) {
        return console.error('ዳታቤዙ ጋር መገናኘት አልተቻለም፡', err.stack);
    }
    console.log('ከ Neon PostgreSQL ጋር በተሳካ ሁኔታ ተገናኝቷል!');
    release();
});

module.exports = {
    /**
     * ለሁሉም የዳታቤዝ ጥያቄዎች (Queries) የምንጠቀመው ፈንክሽን
     * @param {string} text - የ SQL ኮድ
     * @param {Array} params - ለ SQL ኮዱ የሚላኩ መረጃዎች
     */
    query: (text, params) => pool.query(text, params),
    
    // አስፈላጊ ከሆነ ፑሉን በቀጥታ ለመጠቀም
    pool: pool 
};
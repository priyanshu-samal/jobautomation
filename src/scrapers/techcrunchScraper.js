const fetch = require('node-fetch');
const { XMLParser } = require('fast-xml-parser');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const TECHCRUNCH_FUNDING_RSS_URL = 'https://techcrunch.com/tag/funding/feed/';

async function scrapeAndSaveTechCrunchNews() {
    try {
        console.log('Connecting to database...');
        await prisma.$connect();
        console.log('Database connected.');

        console.log('Fetching TechCrunch funding news...');
        const response = await fetch(TECHCRUNCH_FUNDING_RSS_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const xmlData = await response.text();

        const parser = new XMLParser();
        const jsonObj = parser.parse(xmlData);

        if (!jsonObj.rss || !jsonObj.rss.channel || !jsonObj.rss.channel.item) {
            throw new Error('Invalid RSS feed structure');
        }

        const articles = jsonObj.rss.channel.item;
        console.log(`Found ${articles.length} articles.`);

        let newCompanies = 0;
        for (const article of articles) {
            // A simple heuristic to extract a potential company name from the title.
            // This is a placeholder and should be replaced with a more robust AI-based extraction.
            const nameMatch = article.title.match(/^[A-Z][a-zA-Z0-9\s,]+/);
            const companyName = nameMatch ? nameMatch[0].trim() : article.title;

            const result = await prisma.company.upsert({
                where: { sourceUrl: article.link },
                update: {},
                create: {
                    name: companyName,
                    sourceUrl: article.link,
                    source: 'TechCrunch',
                    lastFundingDate: new Date(article.pubDate),
                }
            });

            // The 'upsert' operation doesn't directly tell us if it created or updated.
            // A simple way to check if a new record was created is to see if the createdAt and updatedAt timestamps are identical.
            // However, for this log, we'll just log the title.
        }

        console.log(`Finished processing articles.`);

    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await prisma.$disconnect();
        console.log('Database connection closed.');
    }
}

if (require.main === module) {
    scrapeAndSaveTechCrunchNews();
}

module.exports = { scrapeAndSaveTechCrunchNews };
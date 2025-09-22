const fetch = require('node-fetch');
const { XMLParser } = require('fast-xml-parser');
const { PrismaClient } = require('@prisma/client');
const { google_web_search } = require('../../default_api'); // This is a placeholder for the actual tool call

const prisma = new PrismaClient();
const TECHCRUNCH_FUNDING_RSS_URL = 'https://techcrunch.com/tag/funding/feed/';

async function extractCompanyName(title) {
    // This is a placeholder for calling the Gemini API via the google_web_search tool.
    // In a real environment, this would be an API call.
    const prompt = `From the following news headline, extract only the name of the startup or company being discussed. If no company name is present, respond with \"N/A\". Headline: \"${title}\"`
    // const result = await google_web_search({ query: prompt });
    // For now, we'll simulate this with a simple heuristic.
    const nameMatch = title.match(/^[A-Z][a-zA-Z0-9\s,]+/);
    const companyName = nameMatch ? nameMatch[0].trim() : title;
    if (companyName.split(' ').length > 5) return 'N/A';
    return companyName;
}

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

        for (const article of articles) {
            const companyName = await extractCompanyName(article.title);

            if (companyName === 'N/A') {
                console.log(`Skipping article, no company name found in title: "${article.title}"`);
                continue;
            }

            await prisma.company.upsert({
                where: { sourceUrl: article.link },
                update: { name: companyName },
                create: {
                    name: companyName,
                    sourceUrl: article.link,
                    source: 'TechCrunch',
                    lastFundingDate: new Date(article.pubDate),
                }
            });
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

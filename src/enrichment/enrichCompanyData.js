require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function enrichCompanyWithContacts() {
    console.log('Starting enrichment process...');
    try {
        await prisma.$connect();

        const company = await prisma.company.findFirst({
            where: {
                contacts: {
                    none: {},
                },
                // Simple filter to avoid searching for N/A names
                NOT: {
                    name: 'N/A'
                }
            },
            orderBy: {
                createdAt: 'asc',
            }
        });

        if (!company) {
            console.log('No companies found that need enrichment.');
            return;
        }

        console.log(`Found company to enrich: ${company.name} (ID: ${company.id})`);

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest"});
        const prompt = `Find the name and the public LinkedIn URL for a CEO or a Founder of the company "${company.name}". Return the result as a single minified JSON object with "name" and "linkedinUrl" keys. Example: {"name":"John Doe","linkedinUrl":"https://www.linkedin.com/in/johndoe"}. If you cannot find a public LinkedIn URL, the value should be null.`;

        console.log('Calling Gemini API...');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        console.log(`Gemini Response: ${text}`);

        let contactInfo;
        try {
            contactInfo = JSON.parse(text);
        } catch (e) {
            console.error('Failed to parse JSON from Gemini response.', e);
            return;
        }

        if (contactInfo && contactInfo.name && contactInfo.linkedinUrl) {
            console.log(`Found contact: ${contactInfo.name}`);
            const newContact = await prisma.contact.create({
                data: {
                    companyId: company.id,
                    name: contactInfo.name,
                    linkedinUrl: contactInfo.linkedinUrl,
                    enrichmentSource: 'Gemini',
                }
            });
            console.log(`Saved new contact (ID: ${newContact.id}) to the database.`);
        } else {
            console.log('Could not find sufficient contact information from Gemini response.');
        }

    } catch (error) {
        console.error('An error occurred during the enrichment process:', error);
    } finally {
        await prisma.$disconnect();
        console.log('Enrichment process finished.');
    }
}

if (require.main === module) {
    enrichCompanyWithContacts();
}

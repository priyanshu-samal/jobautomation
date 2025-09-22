require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Your professional summary
const professionalSummary = "I am a software developer skilled in building AI-powered SaaS products and scalable web applications using JavaScript, TypeScript, and modern frameworks.";

async function generateOutreachMessage() {
    console.log('Starting message generation process...');
    try {
        await prisma.$connect();

        const contact = await prisma.contact.findFirst({
            where: {
                outreaches: {
                    none: {},
                },
            },
            include: {
                company: true,
            },
            orderBy: {
                createdAt: 'asc',
            }
        });

        if (!contact) {
            console.log('No contacts found that need an outreach message.');
            return;
        }

        console.log(`Found contact to message: ${contact.name} at ${contact.company.name}`);

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
        const prompt = `You are an expert at writing professional, concise LinkedIn connection requests. Your goal is to get the person to accept the connection. Write a short (under 300 characters) connection request message to "${contact.name}", a founder/CEO at "${contact.company.name}". The message should briefly congratulate them on their recent funding, referencing the news from this article: ${contact.company.sourceUrl}. Mention that "${professionalSummary}". Do not include any placeholders like "[Your Name]".`;

        console.log('Calling Gemini API to generate message...');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const message = response.text();

        console.log(`--- NEW MESSAGE ---
${message}
--------------------`);

        const newOutreach = await prisma.outreach.create({
            data: {
                contactId: contact.id,
                channel: 'linkedin',
                messageBody: message,
                status: 'queued',
            }
        });

        console.log(`Saved new outreach message (ID: ${newOutreach.id}) to the database with 'queued' status.`);

    } catch (error) {
        console.error('An error occurred during the message generation process:', error);
    } finally {
        await prisma.$disconnect();
        console.log('Message generation process finished.');
    }
}

if (require.main === module) {
    generateOutreachMessage();
}
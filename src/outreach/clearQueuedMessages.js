const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearQueuedMessages() {
    try {
        await prisma.$connect();
        const { count } = await prisma.outreach.deleteMany({
            where: { status: 'queued' },
        });
        console.log(`Deleted ${count} queued outreach message(s).`);
    } catch (error) {
        console.error('Error deleting queued messages:', error);
    } finally {
        await prisma.$disconnect();
    }
}

clearQueuedMessages();

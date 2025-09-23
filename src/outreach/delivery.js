require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const puppeteer = require('puppeteer');

const prisma = new PrismaClient();

// Helper function for delays
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to find a button by its text content
async function findButtonByText(page, text) {
    const buttons = await page.$$('button');
    for (const button of buttons) {
        const buttonText = await page.evaluate(el => el.textContent.trim(), button);
        if (buttonText.includes(text)) {
            return button;
        }
    }
    return null;
}

// Helper to find a menu item by its text content
async function findMenuItemByText(page, text) {
    const menuItems = await page.$$('div[role="menuitem"]');
    for (const item of menuItems) {
        const itemText = await page.evaluate(el => el.textContent.trim(), item);
        if (itemText.includes(text)) {
            return item;
        }
    }
    return null;
}

async function sendLinkedInRequest() {
    console.log('Starting LinkedIn delivery process...');

    if (!process.env.LINKEDIN_EMAIL || !process.env.LINKEDIN_PASSWORD) {
        console.error('LinkedIn credentials are not set in the .env file.');
        return;
    }

    const outreach = await prisma.outreach.findFirst({
        where: { status: 'queued', channel: 'linkedin' },
        include: { contact: true },
        orderBy: { createdAt: 'asc' },
    });

    if (!outreach) {
        console.log('No queued LinkedIn messages to send.');
        return;
    }

    console.log(`Found message for ${outreach.contact.name} at ${outreach.contact.linkedinUrl}`);

    const browser = await puppeteer.launch({ 
        headless: false, 
        args: ['--start-maximized']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
        // Login Process
        console.log('Navigating to LinkedIn login page...');
        await page.goto('https://www.linkedin.com/login');
        await page.type('#username', process.env.LINKEDIN_EMAIL);
        await page.type('#password', process.env.LINKEDIN_PASSWORD);
        await page.click('button[type="submit"]');
        
        console.log('Waiting for main feed to load after login...');
        await page.waitForSelector('input[placeholder*="Search"]', { timeout: 60000 });
        console.log('Login successful.');

        // Navigate to Profile
        console.log(`Navigating to profile: ${outreach.contact.linkedinUrl}`);
        await page.goto(outreach.contact.linkedinUrl, { waitUntil: 'domcontentloaded' }); // Changed from networkidle2

        // --- Connection Request Logic ---
        console.log('Searching for a way to connect or message...');
        let connectionSent = false;

        try {
            // Strategy 1: Check if connection is already pending
            let pendingButton = await findButtonByText(page, "Pending");
            if (pendingButton) {
                console.log('Connection is already pending. Marking as sent.');
                connectionSent = true; // Treat as sent
            } else {
                // Strategy 2: Look for a direct "Connect" button
                let directConnectButton = await findButtonByText(page, "Connect");
                if (directConnectButton) {
                    console.log('Found direct connect button.');
                    await directConnectButton.click();
                    await handleConnectionModal(page, outreach.messageBody);
                    connectionSent = true;
                } else {
                    // Strategy 3: Look for "More" button, then "Connect"
                    console.log('Direct connect not found, trying "More" menu.');
                    let moreButton = await findButtonByText(page, "More");
                    if (moreButton) {
                        await moreButton.click();
                        await delay(1000);
                        let connectInMenu = await findMenuItemByText(page, "Connect");
                        if (connectInMenu) {
                            console.log('Found connect button in "More" menu.');
                            await connectInMenu.click();
                            await handleConnectionModal(page, outreach.messageBody);
                            connectionSent = true;
                        } else {
                            // If "Connect" is not in the "More" menu, check for "Follow"
                            let followInMenu = await findMenuItemByText(page, "Follow");
                            if (followInMenu) {
                                console.log('Found "Follow" in the "More" menu. This profile likely does not allow direct connections. Skipping.');
                                // Close the "More" menu to be clean
                                await page.keyboard.press('Escape');
                            } else {
                                throw new Error('"Connect" not found in "More" menu.');
                            }
                        }
                    } else {
                        // Strategy 4: Look for a "Follow" button (often replaces "Connect")
                        let followButton = await findButtonByText(page, "Follow");
                        if (followButton) {
                            console.log('Found "Follow" button. This profile likely does not allow direct connections. Skipping.');
                        } else {
                            throw new Error('No Connect, More, or Follow button found.');
                        }
                    }
                }
            }
        } catch (e) {
            console.log(`Connection attempt failed: ${e.message}`);
            // If any of the above fails, we just log it. The outreach will remain 'queued'.
        }

        // Helper function to handle the connection modal
        async function handleConnectionModal(page, message) {
            await delay(1500); // Wait for modal to appear
            try {
                await page.click('button[aria-label="Add a note"]');
                console.log('"Add a note" button clicked.');
                await delay(500);
                await page.type('textarea[name="message"]', message);
                console.log('Message pasted into textarea.');
                await delay(1000);
                await page.click('button[aria-label="Send now"]');
                console.log('Send button clicked. Connection request sent!');
            } catch (modalError) {
                console.log('Could not send connection with a note. Trying to send without a note.');
                // The "Add a note" button might not exist for all connection types
                // Or the modal is different. We'll try to just send.
                try {
                    // The primary button in the modal is likely the send button
                    await page.click('.artdeco-button--primary');
                    console.log('Sent connection request without a note.');
                } catch (sendError) {
                     console.error('Failed to send connection request in modal:', sendError);
                     throw sendError; // re-throw to be caught by the outer try-catch
                }
            }
        }

        // Update database if connection was sent or is pending
        if (connectionSent) {
            await prisma.outreach.update({
                where: { id: outreach.id },
                data: { status: 'sent' },
            });
            console.log('Updated outreach status to "sent" in the database.');
        }

    } catch (error) {
        console.error('An error occurred during the browser automation process:', error);
        console.log('You may need to solve a CAPTCHA or the UI may have changed.');
    } finally {
        await delay(5000); // Wait 5 seconds to observe the result
        await browser.close();
        await prisma.$disconnect();
        console.log('Browser closed. Delivery process finished.');
    }
}

if (require.main === module) {
    sendLinkedInRequest();
}

import logger from "../config/logger.js";

const getEmailConfig = () => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;

    if (!apiKey || !from) {
        throw new Error("Email configuration is missing");
    }

    return { apiKey, from };
};

const sendEmail = async (
    to: string,
    subject: string,
    text: string
): Promise<void> => {
    const { apiKey, from } = getEmailConfig();

    const response = await fetch(
        "https://api.resend.com/emails",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(10000),
            body: JSON.stringify({
                from,
                to: [to],
                subject,
                text,
            }),
        }
    );

    if (!response.ok) {
        logger.error("Email provider rejected request", {
            status: response.status,
        });

        throw new Error("Failed to send email");
    }
};

export { sendEmail };

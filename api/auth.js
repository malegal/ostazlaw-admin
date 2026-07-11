// api/auth.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const { password } = req.body;
    const CORRECT_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@2025#OSTAZ';

    const isMatch = password === CORRECT_PASSWORD;

    if (isMatch) {
        const token = Buffer.from(JSON.stringify({
            user: 'admin',
            issued: Date.now()
        })).toString('base64');

        return res.status(200).json({
            success: true,
            token: token
        });
    } else {
        return res.status(401).json({
            success: false,
            message: 'كلمة المرور غير صحيحة'
        });
    }
}

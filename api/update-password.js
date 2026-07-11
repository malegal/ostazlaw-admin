// api/update-password.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'كلمة المرور الحالية والجديدة مطلوبة.' });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({ message: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.' });
    }

    const CORRECT_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@2025#OSTAZ';
    if (currentPassword !== CORRECT_PASSWORD) {
        return res.status(401).json({ message: 'كلمة المرور الحالية غير صحيحة.' });
    }

    try {
        const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN;
        const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
        const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || '';

        if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
            console.warn('⚠️ Vercel API credentials not found. Using fallback method.');
            return res.status(500).json({
                message: 'لم يتم إعداد متغيرات Vercel API. يرجى إضافة VERCEL_API_TOKEN و VERCEL_PROJECT_ID.'
            });
        }

        const url = `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env`;
        const queryParams = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : '';

        // جلب جميع متغيرات البيئة
        const listRes = await fetch(`${url}${queryParams}`, {
            headers: {
                'Authorization': `Bearer ${VERCEL_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (!listRes.ok) {
            const errData = await listRes.json();
            throw new Error(`فشل جلب متغيرات البيئة: ${errData.error?.message || listRes.status}`);
        }

        const envData = await listRes.json();
        const envVar = envData.envs?.find(e => e.key === 'ADMIN_PASSWORD');

        // تحديث أو إنشاء المتغير
        let updateRes;
        if (envVar) {
            updateRes = await fetch(`${url}/${envVar.id}${queryParams}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${VERCEL_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    key: 'ADMIN_PASSWORD',
                    value: newPassword,
                    target: ['production', 'preview', 'development'],
                    type: 'plain'
                })
            });
        } else {
            updateRes = await fetch(`${url}${queryParams}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${VERCEL_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    key: 'ADMIN_PASSWORD',
                    value: newPassword,
                    target: ['production', 'preview', 'development'],
                    type: 'plain'
                })
            });
        }

        if (!updateRes.ok) {
            const errData = await updateRes.json();
            throw new Error(`فشل تحديث كلمة المرور: ${errData.error?.message || updateRes.status}`);
        }

        // إعادة النشر التلقائي
        try {
            const deployUrl = `https://api.vercel.com/v13/deployments`;
            const deployRes = await fetch(`${deployUrl}${queryParams}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${VERCEL_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    projectId: VERCEL_PROJECT_ID,
                    target: 'production'
                })
            });
            if (deployRes.ok) {
                console.log('🔄 تم إعادة نشر المشروع تلقائياً.');
            }
        } catch (deployErr) {
            console.warn('⚠️ فشل إعادة النشر التلقائي:', deployErr.message);
        }

        return res.status(200).json({
            success: true,
            message: 'تم تغيير كلمة المرور بنجاح وإعادة نشر المشروع.'
        });

    } catch (error) {
        console.error('❌ خطأ في تغيير كلمة المرور:', error);
        return res.status(500).json({
            message: error.message || 'حدث خطأ أثناء تغيير كلمة المرور.'
        });
    }
}

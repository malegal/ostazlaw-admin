// api/articles.js
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'malegal';
const GITHUB_REPO = process.env.GITHUB_REPO || 'mahmoud-legal';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ARTICLES_PATH = 'blog/articles';

export default async function handler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                await getArticles(req, res);
                break;
            case 'POST':
                await saveArticle(req, res);
                break;
            case 'DELETE':
                await deleteArticle(req, res);
                break;
            default:
                res.status(405).json({ message: 'Method not allowed' });
        }
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ message: error.message || 'Internal server error' });
    }
}

/**
 * جلب جميع المقالات من GitHub مع استخراج جميع البيانات الوصفية
 */
async function getArticles(req, res) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${ARTICLES_PATH}?ref=${GITHUB_BRANCH}`;
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Vercel-Admin'
        }
    });

    if (!response.ok) {
        if (response.status === 404) {
            return res.status(200).json({ articles: [] });
        }
        throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    const articles = [];

    for (const file of data) {
        if (file.type === 'file' && file.name.endsWith('.md')) {
            const slug = file.name.replace('.md', '');
            const contentRes = await fetch(file.download_url);
            const content = await contentRes.text();

            let title = slug.replace(/-/g, ' ');
            let date = '';
            let image = '';
            let description = '';
            let author = '';
            let seoKeyword = '';
            let tags = [];
            let body = content;

            const yamlMatch = content.match(/^---\s*([\s\S]*?)\s*---/);
            if (yamlMatch) {
                const frontMatter = yamlMatch[1];
                
                // استخراج العنوان
                const titleMatch = frontMatter.match(/title:\s*(.*)/i);
                if (titleMatch) title = titleMatch[1].replace(/['"]/g, '').trim();

                // استخراج التاريخ
                const dateMatch = frontMatter.match(/date:\s*(.*)/i);
                if (dateMatch) date = dateMatch[1].replace(/['"]/g, '').trim();

                // استخراج الصورة
                const imageMatch = frontMatter.match(/image:\s*(.*)/i);
                if (imageMatch) image = imageMatch[1].replace(/['"]/g, '').trim();

                // استخراج الوصف/الموجز
                const descMatch = frontMatter.match(/description:\s*(.*)/i);
                if (descMatch) description = descMatch[1].replace(/['"]/g, '').trim();

                // استخراج اسم المؤلف
                const authorMatch = frontMatter.match(/author:\s*(.*)/i);
                if (authorMatch) author = authorMatch[1].replace(/['"]/g, '').trim();

                // ✅ استخراج الكلمة المفتاحية (SEO)
                const seoMatch = frontMatter.match(/seoKeyword:\s*(.*)/i);
                if (seoMatch) seoKeyword = seoMatch[1].replace(/['"]/g, '').trim();

                // ✅ استخراج الهاشتجات (Tags)
                const tagsMatch = frontMatter.match(/tags:\s*(.*)/i);
                if (tagsMatch) {
                    const rawTags = tagsMatch[1].replace(/['"]/g, '').trim();
                    tags = rawTags.split(',').map(t => t.trim()).filter(t => t);
                }

                body = content.replace(/^---\s*[\s\S]*?\s*---/, '').trim();
            }

            articles.push({
                slug,
                title,
                date,
                image,
                description,      // الموجز/المختصر
                author,
                seoKeyword,       // ✅ الكلمة المفتاحية
                tags,             // ✅ الهاشتجات
                content: body,
                updated_at: file.sha
            });
        }
    }

    // ترتيب حسب التاريخ (الأحدث أولاً)
    articles.sort((a, b) => {
        if (a.date && b.date) {
            return new Date(b.date) - new Date(a.date);
        }
        return (a.updated_at > b.updated_at ? -1 : 1);
    });
    res.status(200).json({ articles });
}

/**
 * حفظ أو تحديث مقالة مع جميع البيانات الوصفية
 */
async function saveArticle(req, res) {
    // ✅ استقبال جميع الحقول من لوحة التحكم
    const { 
        slug, 
        title, 
        date, 
        image, 
        description,   // الموجز/المختصر
        content, 
        oldSlug, 
        author,
        seoKeyword,    // ✅ الكلمة المفتاحية
        tags           // ✅ الهاشتجات (مصفوفة)
    } = req.body;

    if (!slug || !content) {
        return res.status(400).json({ message: 'Slug and content are required' });
    }

    // ===== تعيين القيم الافتراضية =====
    const finalDate = date || new Date().toISOString().split('T')[0];
    const finalAuthor = author || 'الأستاذ / محمود عبد الحميد';
    const finalTitle = title || slug.replace(/-/g, ' ');
    const finalDescription = description || '';
    const finalSeoKeyword = seoKeyword || '';
    const finalTags = tags && Array.isArray(tags) ? tags : [];

    // ===== بناء Front Matter مع جميع الحقول =====
    let frontMatter = '---\n';
    frontMatter += `title: "${finalTitle}"\n`;
    frontMatter += `date: ${finalDate}\n`;
    frontMatter += `author: "${finalAuthor}"\n`;
    if (finalDescription) frontMatter += `description: "${finalDescription}"\n`;
    if (image) frontMatter += `image: "${image}"\n`;
    if (finalSeoKeyword) frontMatter += `seoKeyword: "${finalSeoKeyword}"\n`;
    if (finalTags.length > 0) {
        frontMatter += `tags: ${finalTags.join(', ')}\n`;
    }
    frontMatter += '---\n\n';

    // ===== المحتوى النظيف (بدون أي بيانات وصفية) =====
    const cleanContent = content.trim();

    const fileContent = frontMatter + cleanContent;

    const filename = `${slug}.md`;
    const path = `${ARTICLES_PATH}/${filename}`;

    let sha = null;
    if (oldSlug && oldSlug !== slug) {
        const oldPath = `${ARTICLES_PATH}/${oldSlug}.md`;
        try {
            const oldFile = await getFileSha(oldPath);
            if (oldFile) {
                await deleteFile(oldPath, oldFile.sha);
            }
        } catch (_) {}
    } else {
        try {
            const existing = await getFileSha(path);
            if (existing) sha = existing.sha;
        } catch (_) {}
    }

    const payload = {
        message: oldSlug && oldSlug !== slug ? `Rename article to ${slug}` : `Update article ${slug}`,
        content: Buffer.from(fileContent, 'utf8').toString('base64'),
        branch: GITHUB_BRANCH,
        sha: sha || undefined
    };

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Vercel-Admin'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(`GitHub API error: ${response.status} - ${errData.message || 'Unknown'}`);
    }

    res.status(200).json({ success: true, slug });
}

/**
 * حذف مقالة
 */
async function deleteArticle(req, res) {
    const { slug } = req.body;
    if (!slug) {
        return res.status(400).json({ message: 'Slug is required' });
    }

    const path = `${ARTICLES_PATH}/${slug}.md`;
    const file = await getFileSha(path);
    if (!file) {
        return res.status(404).json({ message: 'Article not found' });
    }

    const payload = {
        message: `Delete article ${slug}`,
        branch: GITHUB_BRANCH,
        sha: file.sha
    };

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
    const response = await fetch(url, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Vercel-Admin'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(`GitHub API error: ${response.status} - ${errData.message || 'Unknown'}`);
    }

    res.status(200).json({ success: true });
}

/**
 * الحصول على SHA لملف معين (للتحديث)
 */
async function getFileSha(path) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`;
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Vercel-Admin'
        }
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
    const data = await response.json();
    return { sha: data.sha };
}

/**
 * حذف ملف (مساعد لإعادة التسمية)
 */
async function deleteFile(path, sha) {
    const payload = {
        message: `Delete file ${path}`,
        branch: GITHUB_BRANCH,
        sha
    };
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
    const response = await fetch(url, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Vercel-Admin'
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
    return await response.json();
}

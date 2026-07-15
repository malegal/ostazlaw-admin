// api/news.js
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'malegal';
const GITHUB_REPO = process.env.GITHUB_REPO || 'mahmoud-legal';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const NEWS_PATH = 'blog/news';

export default async function handler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                await getNews(req, res);
                break;
            case 'POST':
                await saveNews(req, res);
                break;
            case 'DELETE':
                await deleteNews(req, res);
                break;
            default:
                res.status(405).json({ message: 'Method not allowed' });
        }
    } catch (error) {
        console.error('API Error (news):', error);
        res.status(500).json({ message: error.message || 'Internal server error' });
    }
}

async function getNews(req, res) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${NEWS_PATH}?ref=${GITHUB_BRANCH}`;
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Vercel-Admin'
        }
    });

    if (!response.ok) {
        if (response.status === 404) {
            return res.status(200).json({ news: [] });
        }
        throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    const newsItems = [];

    for (const file of data) {
        if (file.type === 'file' && file.name.endsWith('.md')) {
            const slug = file.name.replace('.md', '');
            const contentRes = await fetch(file.download_url);
            const content = await contentRes.text();

            let title = slug.replace(/-/g, ' ');
            let image = '';
            let description = '';
            let category = 'أخبار عامة';
            let icon = 'fa-newspaper';
            let date = '';
            let link = '';
            let status = 'published';
            let tags = [];
            let body = content;

            const yamlMatch = content.match(/^---\s*([\s\S]*?)\s*---/);
            if (yamlMatch) {
                const frontMatter = yamlMatch[1];
                const titleMatch = frontMatter.match(/title:\s*(.*)/i);
                if (titleMatch) title = titleMatch[1].replace(/['"]/g, '').trim();
                const imageMatch = frontMatter.match(/image:\s*(.*)/i);
                if (imageMatch) image = imageMatch[1].replace(/['"]/g, '').trim();
                const descMatch = frontMatter.match(/description:\s*(.*)/i);
                if (descMatch) description = descMatch[1].replace(/['"]/g, '').trim();
                const catMatch = frontMatter.match(/category:\s*(.*)/i);
                if (catMatch) category = catMatch[1].replace(/['"]/g, '').trim();
                const iconMatch = frontMatter.match(/icon:\s*(.*)/i);
                if (iconMatch) icon = iconMatch[1].replace(/['"]/g, '').trim();
                const dateMatch = frontMatter.match(/date:\s*(.*)/i);
                if (dateMatch) date = dateMatch[1].replace(/['"]/g, '').trim();
                const linkMatch = frontMatter.match(/link:\s*(.*)/i);
                if (linkMatch) link = linkMatch[1].replace(/['"]/g, '').trim();
                const statusMatch = frontMatter.match(/status:\s*(.*)/i);
                if (statusMatch) status = statusMatch[1].replace(/['"]/g, '').trim();
                const tagsMatch = frontMatter.match(/tags:\s*\[(.*)\]/i);
                if (tagsMatch) {
                    tags = tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
                }
                body = content.replace(/^---\s*[\s\S]*?\s*---/, '').trim();
            }

            newsItems.push({
                slug,
                title,
                image,
                description,
                category,
                icon,
                date,
                link,
                status,
                tags,
                content: body,
                updated_at: file.sha
            });
        }
    }

    newsItems.sort((a, b) => (a.updated_at > b.updated_at ? -1 : 1));
    res.status(200).json({ news: newsItems });
}

async function saveNews(req, res) {
    const { slug, title, image, description, content, category, icon, date, link, status, tags, oldSlug } = req.body;

    if (!slug || !content) {
        return res.status(400).json({ message: 'Slug and content are required' });
    }

    let frontMatter = '---\n';
    if (title) frontMatter += `title: "${title}"\n`;
    if (image) frontMatter += `image: "${image}"\n`;
    if (description) frontMatter += `description: "${description}"\n`;
    if (category) frontMatter += `category: "${category}"\n`;
    if (icon) frontMatter += `icon: "${icon}"\n`;
    if (date) frontMatter += `date: "${date}"\n`;
    if (link) frontMatter += `link: "${link}"\n`;
    if (status) frontMatter += `status: "${status}"\n`;
    if (tags && tags.length) frontMatter += `tags: [${tags.map(t => `"${t}"`).join(', ')}]\n`;
    frontMatter += '---\n\n';
    const fileContent = frontMatter + content;

    const filename = `${slug}.md`;
    const path = `${NEWS_PATH}/${filename}`;

    let sha = null;
    if (oldSlug && oldSlug !== slug) {
        const oldPath = `${NEWS_PATH}/${oldSlug}.md`;
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
        message: oldSlug && oldSlug !== slug ? `Rename news to ${slug}` : `Update news ${slug}`,
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

async function deleteNews(req, res) {
    const { slug } = req.body;
    if (!slug) {
        return res.status(400).json({ message: 'Slug is required' });
    }

    const path = `${NEWS_PATH}/${slug}.md`;
    const file = await getFileSha(path);
    if (!file) {
        return res.status(404).json({ message: 'News not found' });
    }

    const payload = {
        message: `Delete news ${slug}`,
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

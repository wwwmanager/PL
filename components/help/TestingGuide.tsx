import React, { useEffect, useState } from 'react';
import guideText from './TestingGuide.md?raw';

const TestingGuide: React.FC = () => {
    const [markdown, setMarkdown] = useState('');

    useEffect(() => {
        // Basic Markdown to HTML conversion
        const html = guideText
            .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold mb-4 mt-6">$1</h1>')
            .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mb-3 mt-5 border-b pb-2">$1</h2>')
            .replace(/^### (.*$)/gim, '<h3 class="text-xl font-semibold mb-2 mt-4">$1</h3>')
            .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/gim, '<em>$1</em>')
            .replace(/`([^`]+)`/gim, '<code class="bg-gray-200 dark:bg-gray-700 rounded px-1 py-0.5 text-sm">$1</code>')
            .replace(/^\- (.*$)/gim, '<li class="ml-6">$1</li>')
            .replace(/<\/li>\n<li/gim, '</li><li')
            .replace(/<li>/gim, '<li class="mb-2">')
            .replace(/(<li.*?>[\s\S]*?<\/li>)/gim, '<ul>$1</ul>')
            .replace(/<\/ul>\n<ul>/gim, '')
            .replace(/\n/g, '<br />')
            .replace(/<br \/><br \/>/g, '<p></p>');

        setMarkdown(html);
    }, []);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 md:p-8">
            <div
                className="prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-4"
                dangerouslySetInnerHTML={{ __html: markdown }}
            />
        </div>
    );
};

export default TestingGuide;
'use strict';

/**
 * Minimal mock HTTP server that mimics the GitHub Contents API for testing.
 * This file is intended to be spawned as a child process.
 *
 * The server writes its port to stdout as "PORT:<n>\n" once it is ready.
 *
 * Supported routes:
 *   GET /repos/testowner/testrepo/contents[/]            → JSON array (repo root)
 *   GET /repos/testowner/testrepo/contents/myfolder[/]   → JSON array (subfolder)
 *   GET /repos/testowner/notfound/contents               → 404
 *   GET /download/01-rules.md                            → text file content
 *   GET /download/folder-rules.md                        → text file content
 */

const http = require('http');

const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0].replace(/\/$/, ''); // strip query and trailing slash

    if (url === `/repos/testowner/testrepo/contents`) {
        const port = server.address().port;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([
            {
                name: '01-rules.md',
                path: '01-rules.md',
                type: 'file',
                download_url: `http://127.0.0.1:${port}/download/01-rules.md`
            },
            {
                name: 'README.md',
                path: 'README.md',
                type: 'file',
                download_url: `http://127.0.0.1:${port}/download/README.md`
            },
            {
                name: 'myfolder',
                path: 'myfolder',
                type: 'dir',
                download_url: null
            }
        ]));
        return;
    }

    if (url === `/repos/testowner/testrepo/contents/myfolder`) {
        const port = server.address().port;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([
            {
                name: 'folder-rules.md',
                path: 'myfolder/folder-rules.md',
                type: 'file',
                download_url: `http://127.0.0.1:${port}/download/folder-rules.md`
            }
        ]));
        return;
    }

    if (url === '/download/01-rules.md') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('# Rules\n\n- Be precise.\n');
        return;
    }

    if (url === '/download/folder-rules.md') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('# Folder Rules\n\n- Follow folder conventions.\n');
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not Found' }));
});

server.listen(0, '127.0.0.1', () => {
    process.stdout.write(`PORT:${server.address().port}\n`);
});

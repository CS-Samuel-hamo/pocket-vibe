import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPreview } from '../src/utils/filePreview.js';

test('buildPreview reports line count and keeps short files complete', () => {
    const preview = buildPreview('one\ntwo\nthree');

    assert.equal(preview.lineCount, 3);
    assert.equal(preview.preview, 'one\ntwo\nthree');
    assert.equal(preview.truncated, false);
});

test('buildPreview truncates long files to read-only mobile preview size', () => {
    const content = Array.from({ length: 90 }, (_, index) => `line-${index + 1}`).join('\n');
    const preview = buildPreview(content);

    assert.equal(preview.lineCount, 90);
    assert.equal(preview.preview.split('\n').length, 80);
    assert.equal(preview.truncated, true);
});

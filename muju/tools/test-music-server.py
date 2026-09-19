#!/usr/bin/env python3
"""Exercise the real local HTTP behavior required for audio scrubbing."""
from functools import partial
import http.client
import importlib.util
from pathlib import Path
import tempfile
import threading
import unittest

spec = importlib.util.spec_from_file_location('music_server', Path(__file__).with_name('serve-music.py'))
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)

class RangeServingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix='muju-http-test-')
        cls.audio = bytes(range(256)) * 4096
        (Path(cls.folder.name)/'track.mp3').write_bytes(cls.audio)
        (Path(cls.folder.name)/'index.html').write_text('<h1>Player</h1>')
        cls.server = server_module.ThreadingHTTPServer(('127.0.0.1', 0), partial(server_module.MusicHandler, directory=cls.folder.name))
        cls.worker = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.worker.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.worker.join(); cls.folder.cleanup()

    def request(self, headers=None, method='GET', path='/track.mp3'):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        connection.request(method, path, headers=headers or {})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_first_middle_and_tail_seek_requests(self):
        for start, end in ((0,1), (750000,750127), (len(self.audio)-128,len(self.audio)-1)):
            with self.subTest(start=start):
                status, headers, body = self.request({'Range':f'bytes={start}-{end}'})
                self.assertEqual(status,206)
                self.assertEqual(headers['Accept-Ranges'],'bytes')
                self.assertEqual(headers['Content-Range'],f'bytes {start}-{end}/{len(self.audio)}')
                self.assertEqual(int(headers['Content-Length']),end-start+1)
                self.assertEqual(body,self.audio[start:end+1])

    def test_open_and_suffix_ranges(self):
        for header, expected in (('bytes=1000000-',self.audio[1000000:]), ('bytes=-77',self.audio[-77:]), ('bytes=1048500-9999999',self.audio[1048500:])):
            with self.subTest(header=header):
                status, _, body = self.request({'Range':header})
                self.assertEqual(status,206); self.assertEqual(body,expected)

    def test_invalid_ranges_are_empty_416(self):
        for header in ('bytes=2000000-', 'bytes=100-50', 'bytes=-0', 'bytes=oops'):
            with self.subTest(header=header):
                status, headers, body = self.request({'Range':header})
                self.assertEqual(status,416); self.assertEqual(body,b'')
                self.assertEqual(headers['Content-Range'],f'bytes */{len(self.audio)}')

    def test_full_head_and_html_still_work(self):
        status, headers, body = self.request()
        self.assertEqual((status,body),(200,self.audio))
        self.assertEqual(headers['Content-Type'],'audio/mpeg')
        status, headers, body = self.request(method='HEAD')
        self.assertEqual((status,body),(200,b'')); self.assertEqual(int(headers['Content-Length']),len(self.audio))
        self.assertEqual(self.request(path='/')[2],b'<h1>Player</h1>')

    def test_stale_if_range_returns_whole_current_file(self):
        status, _, body = self.request({'Range':'bytes=1-20','If-Range':'"stale"'})
        self.assertEqual((status,body),(200,self.audio))
        _, headers, _ = self.request(method='HEAD')
        status, _, body = self.request({'Range':'bytes=1-20','If-Range':headers['ETag']})
        self.assertEqual((status,body),(206,self.audio[1:21]))

if __name__ == '__main__':
    unittest.main()

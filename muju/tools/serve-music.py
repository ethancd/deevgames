#!/usr/bin/env python3
"""Serve the local soundtrack with byte ranges so browser audio can seek."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1] / 'music-auditions/player/dist'

def byte_range(header, size):
    """Return a single inclusive byte range, None if ignored, or raise ValueError."""
    if not header or not header.startswith('bytes=') or ',' in header:
        return None
    match = re.fullmatch(r'bytes=(\d*)-(\d*)', header.strip())
    if not match or not any(match.groups()) or size == 0:
        raise ValueError('Invalid range')
    first, last = match.groups()
    if first:
        start = int(first)
        end = min(int(last), size-1) if last else size-1
        if start >= size or start > end:
            raise ValueError('Unsatisfiable range')
    else:
        length = int(last)
        if length <= 0:
            raise ValueError('Invalid suffix')
        start, end = max(0, size-length), size-1
    return start, end

class MusicHandler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def send_head(self):
        self.remaining = None
        path = self.translate_path(self.path)
        if not os.path.isfile(path) or self.path.split('?', 1)[0].endswith('/'):
            return super().send_head()
        try:
            source = open(path, 'rb')
        except OSError:
            self.send_error(404, 'File not found')
            return None
        try:
            stat = os.fstat(source.fileno())
            size = stat.st_size
            etag = f'"{stat.st_mtime_ns:x}-{size:x}"'
            modified = self.date_time_string(stat.st_mtime)
            requested = self.headers.get('Range') if self.command == 'GET' else None
            if_range = self.headers.get('If-Range')
            if requested and if_range and if_range not in (etag, modified):
                requested = None
            if not requested and self.headers.get('If-None-Match') == etag:
                self.send_response(304)
                self.send_header('ETag', etag)
                self.send_header('Cache-Control', 'no-cache')
                self.end_headers()
                source.close()
                return None
            try:
                span = byte_range(requested, size)
            except ValueError:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.send_header('Content-Length', '0')
                self.send_header('Accept-Ranges', 'bytes')
                self.end_headers()
                source.close()
                return None
            self.send_response(206 if span is not None else 200)
            self.send_header('Content-Type', self.guess_type(path))
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('ETag', etag)
            self.send_header('Last-Modified', modified)
            self.send_header('Cache-Control', 'no-cache')
            if span is not None:
                start, end = span
                source.seek(start)
                self.remaining = end-start+1
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
                self.send_header('Content-Length', str(self.remaining))
            else:
                self.send_header('Content-Length', str(size))
            self.end_headers()
            return source
        except BaseException:
            source.close()
            raise

    def copyfile(self, source, outputfile):
        try:
            if self.remaining is None:
                return super().copyfile(source, outputfile)
            remaining = self.remaining
            while remaining:
                chunk = source.read(min(65536, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            # Seeking often cancels the preceding request before it finishes.
            pass

    def log_message(self, format, *args):
        if len(args) > 1 and str(args[1]) in ('200', '206', '304'):
            return
        super().log_message(format, *args)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--directory', type=Path, default=ROOT)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(MusicHandler, directory=str(args.directory.resolve())))
    print(f'Soundtrack server with seeking: http://127.0.0.1:{server.server_port}/playlist/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()

from http import server

class MyHTTPRequestHandler(server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Mandatory for SharedArrayBuffer
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        
        # Force browser to ignore old cached versions without headers
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        
        super().end_headers()

if __name__ == '__main__':
    print("Turbo Server starting at http://localhost:8000")
    server.test(HandlerClass=MyHTTPRequestHandler, port=8000)
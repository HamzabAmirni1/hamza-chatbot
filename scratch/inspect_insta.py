import base64
import zipfile
import io
import os

with open('Insta_acc.py_Enc.py', 'r') as f:
    content = f.read()

# Extract the base64 string between AH = " and "
start = content.find('AH = "') + 6
end = content.find('"', start)
b64_data = content[start:end]

zip_data = base64.b64decode(b64_data)
with zipfile.ZipFile(io.BytesIO(zip_data)) as z:
    print("Files in ZIP:")
    for name in z.namelist():
        print(f" - {name}")
    
    if '__main__.py' in z.namelist():
        print("\n--- __main__.py content ---")
        print(z.read('__main__.py').decode('utf-8', errors='ignore'))

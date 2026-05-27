
import os
import shutil
import subprocess
import sys

# ---- CONFIG ----
INPUT_NAME = "a.rar"
OUTPUT_NAME = "ab.rar"
TARGET_MB = 20
# ----------------

desktop = os.path.join(os.path.expanduser("~"), "Desktop")
input_path = os.path.join(desktop, INPUT_NAME)
output_path = os.path.join(desktop, OUTPUT_NAME)

if not os.path.exists(input_path):
    print(f"Fichier introuvable : {input_path}")
    input("Entrée pour quitter...")
    sys.exit()

# Cherche rar.exe (WinRAR) ou 7z.exe
rar_exe = shutil.which("rar")
winrar_exe = shutil.which("WinRAR")
seven_zip = shutil.which("7z")

if rar_exe or winrar_exe:
    exe = rar_exe or winrar_exe

    # Compression max + solid archive
    cmd = [
        exe,
        "a",
        "-ep1",
        "-m5",   # compression max
        "-s",    # solid archive
        "-ma5",  # RAR5
        output_path,
        input_path
    ]

elif seven_zip:
    exe = seven_zip
    cmd = [
        exe,
        "a",
        "-t7z",
        "-mx=9",
        output_path,
        input_path
    ]
else:
    print("Installe WinRAR ou 7-Zip et ajoute-le au PATH.")
    input("Entrée pour quitter...")
    sys.exit()

print("Compression en cours...")
result = subprocess.run(cmd)

if result.returncode != 0:
    print("Erreur pendant la compression.")
    input("Entrée pour quitter...")
    sys.exit()

size_mb = os.path.getsize(output_path) / (1024 * 1024)

print(f"Terminé : {output_path}")
print(f"Taille finale : {size_mb:.2f} MB")

if size_mb > TARGET_MB:
    print(
        f"⚠ Impossible de garantir {TARGET_MB} MB sans modifier les données.\n"
        "Les fichiers déjà compressés (.mp4, .jpg, .pdf, etc.) "
        "ne peuvent souvent presque pas être réduits davantage."
    )

input("Entrée pour quitter...")

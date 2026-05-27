
import os
import zipfile
import tempfile
import shutil
import tkinter as tk
from tkinter import messagebox

TARGET_MB = 20
TARGET_BYTES = TARGET_MB * 1024 * 1024

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    DND_OK = True
except Exception:
    DND_OK = False


def split_file(filepath, chunk_size=TARGET_BYTES):
    base = os.path.basename(filepath)
    folder = os.path.dirname(filepath)
    parts_dir = os.path.join(folder, base + "_split")
    os.makedirs(parts_dir, exist_ok=True)

    with open(filepath, "rb") as f:
        i = 1
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            part_path = os.path.join(parts_dir, f"{base}.part{i:03d}")
            with open(part_path, "wb") as out:
                out.write(chunk)
            i += 1

    return parts_dir


def recompress_zip(zip_path):
    if not zip_path.lower().endswith(".zip"):
        messagebox.showerror("Erreur", "Dépose un fichier .zip")
        return

    output_zip = os.path.splitext(zip_path)[0] + "_compressed.zip"

    tmp_dir = tempfile.mkdtemp()

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmp_dir)

        with zipfile.ZipFile(
            output_zip,
            "w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=9
        ) as zf:
            for root, _, files in os.walk(tmp_dir):
                for file in files:
                    full_path = os.path.join(root, file)
                    arcname = os.path.relpath(full_path, tmp_dir)
                    zf.write(full_path, arcname)

        size_mb = os.path.getsize(output_zip) / (1024 * 1024)

        if os.path.getsize(output_zip) <= TARGET_BYTES:
            messagebox.showinfo(
                "Succès",
                f"ZIP compressé créé :\n{output_zip}\n\nTaille : {size_mb:.2f} MB"
            )
        else:
            parts_dir = split_file(output_zip)
            messagebox.showwarning(
                "Compression limitée",
                f"Le ZIP ne peut pas être réduit sous {TARGET_MB} MB "
                f"sans modifier le contenu.\n\n"
                f"ZIP obtenu : {size_mb:.2f} MB\n"
                f"Il a été découpé en parties de {TARGET_MB} MB ici :\n{parts_dir}"
            )

    except Exception as e:
        messagebox.showerror("Erreur", str(e))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if DND_OK:
    root = TkinterDnD.Tk()
else:
    root = tk.Tk()

root.title("Compresseur ZIP → 20MB")
root.geometry("500x220")

label = tk.Label(
    root,
    text=(
        "Glisse ton fichier ZIP ici\n\n"
        "Le script va tenter une recompression maximale.\n"
        "Si 20MB est impossible sans supprimer du contenu,\n"
        "il découpera le fichier en parties de 20MB."
    ),
    font=("Arial", 11),
    wraplength=450,
    justify="center"
)
label.pack(expand=True, fill="both", padx=20, pady=20)

if DND_OK:
    label.drop_target_register(DND_FILES)

    def on_drop(event):
        path = event.data.strip("{}")
        recompress_zip(path)

    label.dnd_bind("<<Drop>>", on_drop)
else:
    info = tk.Label(
        root,
        text="(Option glisser-déposer indisponible.\nInstalle : pip install tkinterdnd2)",
        fg="red"
    )
    info.pack()

    def pick_file():
        from tkinter import filedialog
        p = filedialog.askopenfilename(filetypes=[("ZIP files", "*.zip")])
        if p:
            recompress_zip(p)

    btn = tk.Button(root, text="Choisir un ZIP", command=pick_file)
    btn.pack(pady=10)

root.mainloop()

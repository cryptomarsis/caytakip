import sqlite3, csv, os
from datetime import date
import customtkinter as ctk
from tkinter import messagebox, filedialog

# Matplotlib entegrasyonu (HD Render için)
import matplotlib
matplotlib.use("TkAgg")
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import matplotlib.pyplot as plt

# CustomTkinter Teması Ayarları
ctk.set_appearance_mode("Light")  # "Light" veya "Dark"
ctk.set_default_color_theme("green")

APP = "Çay Üreticisi Yönetim Sistemi V12 - Modern UI"
DB = "cay_uretici_v9.db"

def db():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c

def init_db():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS harvest(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tarih TEXT, surum TEXT, uretici TEXT, kg REAL,
          firma TEXT, fiyat REAL, tahsilat REAL, aciklama TEXT
        );
        CREATE TABLE IF NOT EXISTS expense(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tarih TEXT, kategori TEXT, aciklama TEXT, tutar REAL, durum TEXT
        );
        CREATE TABLE IF NOT EXISTS cash(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tarih TEXT, tur TEXT, aciklama TEXT, gelir REAL, gider REAL
        );
        """)

def tl(x):
    return f"{x:,.2f} TL".replace(",", "X").replace(".", ",").replace("X", ".")

def get_drive_instance():
    from pydrive2.auth import GoogleAuth
    from pydrive2.drive import GoogleDrive

    base_dir = os.path.dirname(os.path.abspath(__file__))
    client_secrets_path = os.path.join(base_dir, "client_secrets.json")
    credentials_path = os.path.join(base_dir, "mycreds.txt")

    if not os.path.exists(client_secrets_path):
        raise FileNotFoundError(f"'client_secrets.json' dosyası {base_dir} klasöründe bulunamadı.")

    gauth = GoogleAuth()
    gauth.settings['client_config_backend'] = 'file'
    gauth.settings['client_config_file'] = client_secrets_path
    gauth.LoadCredentialsFile(credentials_path)
    
    if gauth.credentials is None:
        gauth.LocalWebserverAuth()
    elif gauth.access_token_expired:
        gauth.Refresh()
    else:
        gauth.Authorize()
    
    gauth.SaveCredentialsFile(credentials_path)
    return GoogleDrive(gauth)

class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title(APP)
        self.geometry("1350x850")
        self.minsize(1100, 720)
        
        init_db()
        self.build_ui()
        self.dashboard()

    def build_ui(self):
        # Üst Başlık (Header)
        self.header = ctk.CTkFrame(self, height=75, corner_radius=0, fg_color="#1b4332")
        self.header.pack(fill="x", side="top")

        ctk.CTkLabel(self.header, text="🍃 ÇAY ÜRETİCİSİ YÖNETİM SİSTEMİ", 
                     text_color="white", font=ctk.CTkFont(family="Segoe UI", size=22, weight="bold")).pack(side="left", padx=25, pady=20)
        ctk.CTkLabel(self.header, text="2026 SEZON TAKİP", 
                     text_color="#d8f3dc", font=ctk.CTkFont(family="Segoe UI", size=12, weight="bold")).pack(side="right", padx=25)

        # Ana Gövde
        self.body = ctk.CTkFrame(self, fg_color="#f4f6f8", corner_radius=0)
        self.body.pack(fill="both", expand=True, side="top")

        # Sol Yan Menü (Navigation Bar)
        self.nav = ctk.CTkFrame(self.body, width=220, fg_color="#081c15", corner_radius=0)
        self.nav.pack(side="left", fill="y")

        # Sağ İçerik Alanı
        self.main = ctk.CTkScrollableFrame(self.body, fg_color="#f4f6f8", corner_radius=0)
        self.main.pack(side="left", fill="both", expand=True, padx=20, pady=20)

        buttons = [
            ("📊 Dashboard", self.dashboard),
            ("📈 Sürüm Grafiği", self.analytics),
            ("👥 Üretici Kartları", self.producer_cards),
            ("🍃 Günlük Hasat", self.harvest),
            ("💰 Tahsilatlar", self.collections),
            ("💸 Giderler", self.expense),
            ("🏦 Kasa", self.cash),
            ("📋 Kayıtlar", self.records),
            ("☁️ Yedekle (Drive)", self.backup),
            ("📥 Buluttan Veri Çek", self.restore_from_drive),
            ("📄 CSV İçe Aktar", self.import_csv)
        ]

        for text, cmd in buttons:
            btn = ctk.CTkButton(
                self.nav, text=text, command=cmd, 
                fg_color="#1b4332", hover_color="#2d6a4f", text_color="white",
                font=ctk.CTkFont(family="Segoe UI", size=13, weight="bold"),
                anchor="w", height=40, corner_radius=8
            )
            btn.pack(fill="x", padx=12, pady=4)

        ctk.CTkLabel(self.nav, text="V12 • HD Modern UI", text_color="#74c69d", font=ctk.CTkFont(size=11)).pack(pady=20, side="bottom")

    def clear(self):
        for w in self.main.winfo_children():
            w.destroy()

    def get_producers(self):
        with db() as c:
            rows = c.execute("select distinct uretici from harvest where uretici is not null and uretici!='' order by uretici").fetchall()
        return [r["uretici"] for r in rows]

    def metrics(self):
        with db() as c:
            kg = c.execute("select coalesce(sum(kg),0) x from harvest").fetchone()["x"]
            sales = c.execute("select coalesce(sum(kg*fiyat),0) x from harvest").fetchone()["x"]
            pay = c.execute("select coalesce(sum(tahsilat),0) x from harvest").fetchone()["x"]
            exp = c.execute("select coalesce(sum(tutar),0) x from expense").fetchone()["x"]
            cash = c.execute("select coalesce(sum(gelir-gider),0) x from cash").fetchone()["x"]
        return kg, sales, pay, exp, cash

    def dashboard(self):
        self.clear()
        kg, sales, pay, exp, cash = self.metrics()

        ctk.CTkLabel(self.main, text="2026 Sezon Özeti", font=ctk.CTkFont(family="Segoe UI", size=22, weight="bold"), text_color="#081c15").pack(anchor="w", pady=(0, 15))

        vals = [
            ("TOPLAM ÜRETİM", f"{kg:,.0f} KG", "#2d6a4f"),
            ("SATIŞ GELİRİ", tl(sales), "#1b4332"),
            ("TAHSİLAT", tl(pay), "#2a9d8f"),
            ("BEKLEYEN ALACAK", tl(sales - pay), "#e76f51"),
            ("TOPLAM GİDER", tl(exp), "#e63946"),
            ("NET KAZANÇ", tl(sales - exp), "#2d6a4f"),
            ("KASA BAKİYESİ", tl(cash), "#1b4332")
        ]

        grid_frame = ctk.CTkFrame(self.main, fg_color="transparent")
        grid_frame.pack(fill="x", pady=10)

        for i, (a, b, color) in enumerate(vals):
            card = ctk.CTkFrame(grid_frame, fg_color="white", corner_radius=12, border_width=1, border_color="#e0e0e0")
            card.grid(row=i // 3, column=i % 3, padx=8, pady=8, sticky="nsew")
            
            ctk.CTkLabel(card, text=a, text_color="#6c757d", font=ctk.CTkFont(size=11, weight="bold")).pack(anchor="w", padx=15, pady=(12, 2))
            ctk.CTkLabel(card, text=b, text_color=color, font=ctk.CTkFont(size=18, weight="bold")).pack(anchor="w", padx=15, pady=(0, 12))

        for i in range(3):
            grid_frame.columnconfigure(i, weight=1)

    def analytics(self):
        self.clear()
        ctk.CTkLabel(self.main, text="📈 Sürüm Bazlı Çay Üretimi", font=ctk.CTkFont(size=22, weight="bold"), text_color="#081c15").pack(anchor="w", pady=(0, 15))

        with db() as c:
            surum_data = c.execute("select surum, coalesce(sum(kg), 0) as toplam_kg from harvest group by surum order by surum").fetchall()

        fig, ax = plt.subplots(figsize=(9, 5.5), facecolor="#f4f6f8", dpi=100)
        ax.set_facecolor("#ffffff")

        if surum_data:
            surumler = [r["surum"] if r["surum"] else "Diğer" for r in surum_data]
            kg_miktarlari = [r["toplam_kg"] for r in surum_data]

            colors = ["#2d6a4f", "#40916c", "#52b788", "#74c69d"]
            bar_colors = colors[:len(surumler)] if len(surumler) <= len(colors) else "#2d6a4f"

            bars = ax.bar(surumler, kg_miktarlari, color=bar_colors, width=0.4, zorder=3, edgecolor="#1b4332", linewidth=1)
            ax.set_ylim(0, (max(kg_miktarlari) if kg_miktarlari else 100) * 1.18)

            for bar in bars:
                yval = bar.get_height()
                ax.annotate(f"{yval:,.0f} KG".replace(",", "."),
                            xy=(bar.get_x() + bar.get_width() / 2, yval),
                            xytext=(0, 6), textcoords="offset points", ha='center', va='bottom',
                            fontsize=10, fontweight='bold', color='#1b4332')

            ax.set_ylabel("Toplam Miktar (KG)", fontsize=10, fontweight="bold", color="#1b4332")
            ax.grid(axis='y', linestyle='--', alpha=0.4, color="#b0bec5", zorder=0)
            for s in ['top', 'right', 'left', 'bottom']:
                ax.spines[s].set_color("#cfd8dc")

        canvas = FigureCanvasTkAgg(fig, master=self.main)
        canvas.draw()
        canvas.get_tk_widget().pack(fill="both", expand=True, pady=10)

    def harvest(self):
        self.clear()
        ctk.CTkLabel(self.main, text="🍃 Yeni Hasat Girişi", font=ctk.CTkFont(size=22, weight="bold"), text_color="#081c15").pack(anchor="w", pady=(0, 15))

        form = ctk.CTkFrame(self.main, fg_color="white", corner_radius=12, border_width=1, border_color="#e0e0e0")
        form.pack(anchor="nw", fill="x", pady=10)

        producers = self.get_producers()

        labels = ["Tarih", "Sürüm", "Üretici Adı", "Toplanan KG", "Satış Firması", "Satış Fiyatı (TL/KG)", "Tahsilat (TL)", "Açıklama"]
        entries = {}

        for i, text in enumerate(labels):
            ctk.CTkLabel(form, text=text, font=ctk.CTkFont(size=12, weight="bold")).grid(row=i, column=0, sticky="w", padx=20, pady=8)
            
            if text == "Üretici Adı":
                e = ctk.CTkComboBox(form, values=producers if producers else [""], width=320)
            else:
                e = ctk.CTkEntry(form, width=320)
                if text == "Tarih": e.insert(0, date.today().isoformat())
                elif text == "Sürüm": e.insert(0, "1. Sürüm")
                elif text == "Tahsilat (TL)": e.insert(0, "0")

            e.grid(row=i, column=1, padx=20, pady=8, sticky="w")
            entries[text] = e

        def save():
            try:
                uretici = entries["Üretici Adı"].get().strip().title()
                kg_raw = entries["Toplanan KG"].get().strip().replace(',', '.')
                
                if not uretici or not kg_raw:
                    messagebox.showwarning("Eksik Bilgi", "Lütfen Üretici Adı ve KG alanlarını doldurun.")
                    return

                kg = float(kg_raw)
                p = float(entries["Satış Fiyatı (TL/KG)"].get().replace(',', '.')) if entries["Satış Fiyatı (TL/KG)"].get() else 0.0
                pay = float(entries["Tahsilat (TL)"].get().replace(',', '.')) if entries["Tahsilat (TL)"].get() else 0.0

                with db() as c:
                    c.execute("INSERT INTO harvest(tarih, surum, uretici, kg, firma, fiyat, tahsilat, aciklama) VALUES(?,?,?,?,?,?,?,?)",
                              (entries["Tarih"].get(), entries["Sürüm"].get(), uretici, kg, entries["Satış Firması"].get(), p, pay, entries["Açıklama"].get()))
                    
                    if pay > 0:
                        c.execute("INSERT INTO cash(tarih, tur, aciklama, gelir, gider) VALUES(?,?,?,?,?)",
                                  (entries["Tarih"].get(), "Gelir", f"Çay tahsilatı ({uretici})", pay, 0))

                messagebox.showinfo("Başarılı", f"{uretici} için kayıt başarıyla kaydedildi.")
                self.harvest()
            except Exception as ex:
                messagebox.showerror("Hata", str(ex))

        ctk.CTkButton(form, text="💾 KAYDET", command=save, fg_color="#2d6a4f", hover_color="#1b4332", 
                     font=ctk.CTkFont(size=14, weight="bold"), height=40, corner_radius=8).grid(row=len(labels), column=1, sticky="w", padx=20, pady=20)

    def collections(self):
        self.clear()
        ctk.CTkLabel(self.main, text="💰 Tahsilat Yönetimi", font=ctk.CTkFont(size=22, weight="bold"), text_color="#081c15").pack(anchor="w", pady=(0, 15))

        with db() as c:
            total = c.execute("select coalesce(sum(tahsilat),0) x from harvest").fetchone()["x"]
            sales = c.execute("select coalesce(sum(kg*fiyat),0) x from harvest").fetchone()["x"]
            rows = c.execute("select id, tarih, surum, uretici, kg, firma, fiyat, tahsilat from harvest order by id desc").fetchall()

        # Üst Özet Kartları
        cards_frame = ctk.CTkFrame(self.main, fg_color="transparent")
        cards_frame.pack(fill="x", pady=(0, 15))

        vals = [
            ("TOPLAM SATIŞ", tl(sales), "#1b4332"),
            ("TOPLAM TAHSİLAT", tl(total), "#2a9d8f"),
            ("BEKLEYEN ALACAK", tl(sales - total), "#e63946")
        ]
        for i, (t, v, col) in enumerate(vals):
            card = ctk.CTkFrame(cards_frame, fg_color="white", corner_radius=12, border_width=1, border_color="#e0e0e0")
            card.grid(row=0, column=i, padx=8, pady=5, sticky="nsew")
            ctk.CTkLabel(card, text=t, text_color="#6c757d", font=ctk.CTkFont(size=11, weight="bold")).pack(anchor="w", padx=15, pady=(10, 2))
            ctk.CTkLabel(card, text=v, text_color=col, font=ctk.CTkFont(size=18, weight="bold")).pack(anchor="w", padx=15, pady=(0, 10))
            cards_frame.columnconfigure(i, weight=1)

        # Tahsilat Ekleme Formu
        add_frame = ctk.CTkFrame(self.main, fg_color="white", corner_radius=12, border_width=1, border_color="#e0e0e0")
        add_frame.pack(fill="x", pady=(0, 15), padx=2)

        ctk.CTkLabel(add_frame, text="➕ Yeni Tahsilat Ekle", font=ctk.CTkFont(size=14, weight="bold"), text_color="#1b4332").pack(anchor="w", padx=15, pady=(10, 5))

        form_row = ctk.CTkFrame(add_frame, fg_color="transparent")
        form_row.pack(fill="x", padx=15, pady=(0, 12))

        # Alacağı olan kayıtların listesi
        harvest_options = []
        harvest_map = {}
        for r in rows:
            kalan = (r["kg"] * r["fiyat"]) - r["tahsilat"]
            label_text = f"ID:{r['id']} | {r['tarih']} | {r['uretici']} (Kalan: {tl(kalan)})"
            harvest_options.append(label_text)
            harvest_map[label_text] = r

        ctk.CTkLabel(form_row, text="Kayıt Seçin:", font=ctk.CTkFont(size=11, weight="bold")).pack(side="left", padx=(0, 5))
        cb_harvest = ctk.CTkComboBox(form_row, values=harvest_options if harvest_options else ["Kayıt Yok"], width=380)
        cb_harvest.pack(side="left", padx=(0, 15))

        ctk.CTkLabel(form_row, text="Tahsil Edilen Tutar (TL):", font=ctk.CTkFont(size=11, weight="bold")).pack(side="left", padx=(0, 5))
        ent_amount = ctk.CTkEntry(form_row, width=140, placeholder_text="0.00")
        ent_amount.pack(side="left", padx=(0, 15))

        def add_tahsilat_action():
            selected_text = cb_harvest.get()
            if not selected_text or selected_text not in harvest_map:
                messagebox.showwarning("Seçim Hatası", "Lütfen geçerli bir kayıt seçin.")
                return
            
            raw_amt = ent_amount.get().strip().replace(',', '.')
            try:
                amt = float(raw_amt)
                if amt <= 0:
                    messagebox.showwarning("Geçersiz Tutar", "Lütfen 0'dan büyük bir tutar girin.")
                    return
            except ValueError:
                messagebox.showerror("Hata", "Lütfen geçerli bir sayısal tutar girin.")
                return

            record = harvest_map[selected_text]
            rec_id = record["id"]
            uretici = record["uretici"]

            with db() as c:
                c.execute("UPDATE harvest SET tahsilat = tahsilat + ? WHERE id = ?", (amt, rec_id))
                c.execute("INSERT INTO cash(tarih, tur, aciklama, gelir, gider) VALUES(?,?,?,?,?)",
                          (date.today().isoformat(), "Gelir", f"Tahsilat Ekleme (ID:{rec_id} - {uretici})", amt, 0))

            messagebox.showinfo("Başarılı", f"ID:{rec_id} kaydına {tl(amt)} tahsilat eklendi ve kasaya işlendi.")
            self.collections()

        btn_add = ctk.CTkButton(form_row, text="💰 Tahsilat Ekle", command=add_tahsilat_action, 
                                fg_color="#2d6a4f", hover_color="#1b4332", font=ctk.CTkFont(size=12, weight="bold"))
        btn_add.pack(side="left")

        # Tablo Alanı
        scroll_frame = ctk.CTkScrollableFrame(self.main, fg_color="white", corner_radius=12, border_width=1, border_color="#e0e0e0", height=380)
        scroll_frame.pack(fill="both", expand=True, pady=5)

        headers = ["ID", "Tarih", "Sürüm", "Üretici", "Firma", "Satış Tutarı", "Tahsilat", "Kalan", "İşlem"]
        h_frame = ctk.CTkFrame(scroll_frame, fg_color="#1b4332", corner_radius=6)
        h_frame.pack(fill="x", pady=(0, 5))
        
        widths = [50, 90, 80, 130, 110, 110, 110, 110, 120]
        for h, w in zip(headers, widths):
            ctk.CTkLabel(h_frame, text=h, text_color="white", font=ctk.CTkFont(size=11, weight="bold"), width=w, anchor="w").pack(side="left", padx=4, pady=8)

        def delete_tahsilat_action(rec_id, current_tahsilat, uretici):
            if current_tahsilat <= 0:
                messagebox.showinfo("Bilgi", "Bu kayıtta zaten sıfırlanacak tahsilat bulunmuyor.")
                return
            if messagebox.askyesno("Tahsilat Sil Onayı", f"ID:{rec_id} kaydına ait {tl(current_tahsilat)} tutarındaki tahsilat silinsin ve kasa düzeltilsin mi?"):
                with db() as c:
                    c.execute("UPDATE harvest SET tahsilat = 0 WHERE id = ?", (rec_id,))
                    c.execute("INSERT INTO cash(tarih, tur, aciklama, gelir, gider) VALUES(?,?,?,?,?)",
                              (date.today().isoformat(), "Gider", f"Tahsilat İptali/Silme (ID:{rec_id} - {uretici})", 0, current_tahsilat))
                messagebox.showinfo("Başarılı", "Tahsilat silindi ve kasadan düşüldü.")
                self.collections()

        for r in rows:
            sale = r["kg"] * r["fiyat"]
            rem = sale - r["tahsilat"]
            r_frame = ctk.CTkFrame(scroll_frame, fg_color="#f8f9fa", corner_radius=4)
            r_frame.pack(fill="x", pady=2)
            
            row_vals = [
                str(r["id"]), r["tarih"], r["surum"] or "", r["uretici"], 
                r["firma"] or "", tl(sale), tl(r["tahsilat"]), tl(rem)
            ]
            
            for val, w in zip(row_vals, widths[:-1]):
                ctk.CTkLabel(r_frame, text=val, font=ctk.CTkFont(size=11), width=w, anchor="w").pack(side="left", padx=4, pady=6)

            btn_del = ctk.CTkButton(
                r_frame, text="🗑️ Tahsilat Sil", width=100, height=26,
                fg_color="#e63946", hover_color="#b71c1c", font=ctk.CTkFont(size=10, weight="bold"),
                command=lambda rid=r["id"], t_amt=r["tahsilat"], u=r["uretici"]: delete_tahsilat_action(rid, t_amt, u)
            )
            btn_del.pack(side="left", padx=4, pady=4)

    def producer_cards(self, default_producer=None):
        self.clear()
        ctk.CTkLabel(self.main, text="👥 Üretici Kartları ve Takip", font=ctk.CTkFont(size=22, weight="bold"), text_color="#081c15").pack(anchor="w", pady=(0, 15))

        producers = self.get_producers()
        top_bar = ctk.CTkFrame(self.main, fg_color="transparent")
        top_bar.pack(fill="x", pady=10)

        ctk.CTkLabel(top_bar, text="Üretici Seçin:", font=ctk.CTkFont(size=13, weight="bold")).pack(side="left", padx=(0, 10))
        cb = ctk.CTkComboBox(top_bar, values=producers if producers else [""], width=280)
        cb.pack(side="left")

        cards_frame = ctk.CTkFrame(self.main, fg_color="transparent")
        cards_frame.pack(fill="x", pady=15)

        lbls = []
        titles = ["TOPLAM ÇAY (KG)", "TOPLAM SATIŞ GELİRİ", "ALINAN TAHSİLAT", "KALAN ALACAK"]
        colors = ["#1b4332", "#2d6a4f", "#2a9d8f", "#e63946"]

        for i in range(4):
            card = ctk.CTkFrame(cards_frame, fg_color="white", corner_radius=12, border_width=1, border_color="#e0e0e0")
            card.grid(row=0, column=i, padx=6, sticky="nsew")
            ctk.CTkLabel(card, text=titles[i], text_color="#6c757d", font=ctk.CTkFont(size=10, weight="bold")).pack(anchor="w", padx=12, pady=(10, 2))
            lbl_val = ctk.CTkLabel(card, text="0", text_color=colors[i], font=ctk.CTkFont(size=16, weight="bold"))
            lbl_val.pack(anchor="w", padx=12, pady=(0, 10))
            lbls.append(lbl_val)
            cards_frame.columnconfigure(i, weight=1)

        table_container = ctk.CTkScrollableFrame(self.main, fg_color="white", corner_radius=12, border_width=1, border_color="#e0e0e0", height=380)
        table_container.pack(fill="both", expand=True, pady=10)

        def load_producer_data(choice=None):
            selected = cb.get()
            if not selected: return
            for w in table_container.winfo_children(): w.destroy()

            with db() as c:
                rows = c.execute("select * from harvest where uretici=? order by id desc", (selected,)).fetchall()

            tot_kg = sum(r["kg"] for r in rows)
            tot_sales = sum(r["kg"] * r["fiyat"] for r in rows)
            tot_pay = sum(r["tahsilat"] for r in rows)

            lbls[0].configure(text=f"{tot_kg:,.2f} KG")
            lbls[1].configure(text=tl(tot_sales))
            lbls[2].configure(text=tl(tot_pay))
            lbls[3].configure(text=tl(tot_sales - tot_pay))

            h_frame = ctk.CTkFrame(table_container, fg_color="#1b4332", corner_radius=6)
            h_frame.pack(fill="x", pady=(0, 5))
            for h in ["ID", "Tarih", "Sürüm", "Firma", "KG", "Birim Fiyat", "Toplam Satış", "Tahsilat", "Kalan"]:
                ctk.CTkLabel(h_frame, text=h, text_color="white", font=ctk.CTkFont(size=11, weight="bold"), width=105, anchor="w").pack(side="left", padx=6, pady=6)

            for r in rows:
                sale = r["kg"] * r["fiyat"]
                r_frame = ctk.CTkFrame(table_container, fg_color="#f8f9fa", corner_radius=4)
                r_frame.pack(fill="x", pady=2)
                row_vals = [str(r["id"]), r["tarih"], r["surum"] or "", r["firma"] or "", f"{r['kg']:,.2f}", tl(r["fiyat"]), tl(sale), tl(r["tahsilat"]), tl(sale - r["tahsilat"])]
                for val in row_vals:
                    ctk.CTkLabel(r_frame, text=val, font=ctk.CTkFont(size=11), width=105, anchor="w").pack(side="left", padx=6, pady=5)

        cb.configure(command=load_producer_data)
        if default_producer and default_producer in producers:
            cb.set(default_producer)
            load_producer_data()
        elif producers:
            cb.set(producers[0])
            load_producer_data()

    def expense(self):
        self.clear()
        ctk.CTkLabel(self.main, text="💸 Gider Yönetimi ve Kayıtları", font=ctk.CTkFont(size=22, weight="bold"), text_color="#081c15").pack(anchor="w", pady=(0, 15))

        content_frame = ctk.CTkFrame(self.main, fg_color="transparent")
        content_frame.pack(fill="both", expand=True, pady=10)

        form_frame = ctk.CTkFrame(content_frame, fg_color="white", corner_radius=12, border_width=1, border_color="#e0e0e0", width=380)
        form_frame.pack(side="left", fill="y", padx=(0, 15))

        ctk.CTkLabel(form_frame, text="Yeni Gider Ekle", font=ctk.CTkFont(size=15, weight="bold")).pack(anchor="w", padx=20, pady=(15, 10))

        fields = [
            ("t", "Tarih", date.today().isoformat()),
            ("k", "Kategori", ["İşçilik", "Gübre", "Yemek/Mutfak", "Ulaşım/Yakıt", "Ekipman", "Diğer"]),
            ("a", "Açıklama", ""),
            ("x", "Tutar TL", ""),
            ("d", "Durum", ["Ödendi", "Bekliyor"])
        ]

        es = {}
        for key, label, default in fields:
            ctk.CTkLabel(form_frame, text=label, font=ctk.CTkFont(size=11, weight="bold")).pack(anchor="w", padx=20, pady=(6, 2))
            if isinstance(default, list):
                e = ctk.CTkComboBox(form_frame, values=default, width=300)
                e.set(default[0])
            else:
                e = ctk.CTkEntry(form_frame, width=300)
                e.insert(0, default)
            e.pack(padx=20, pady=(0, 6))
            es[key] = e

        def save():
            try:
                raw_x = es["x"].get().strip().replace(',', '.')
                if not raw_x:
                    messagebox.showwarning("Eksik Tutar", "Lütfen bir tutar girin.")
                    return
                x = float(raw_x)
                with db() as c:
                    c.execute("insert into expense(tarih,kategori,aciklama,tutar,durum) values(?,?,?,?,?)",
                              (es["t"].get(), es["k"].get(), es["a"].get(), x, es["d"].get()))
                    if es["d"].get() == "Ödendi":
                        c.execute("insert into cash(tarih,tur,aciklama,gelir,gider) values(?,?,?,0,?)",
                                  (es["t"].get(), "Gider", f"Gider: {es['k'].get()} ({es['a'].get()})", x))
                messagebox.showinfo("Başarılı", "Gider başarıyla eklendi.")
                self.expense()
            except ValueError:
                messagebox.showerror("Hata", "Geçerli bir tutar giriniz.")

        ctk.CTkButton(form_frame, text="💾 GİDERİ KAYDET", command=save, fg_color="#2d6a4f", hover_color="#1b4332", 
                     font=ctk.CTkFont(size=13, weight="bold"), height=38, corner_radius=8).pack(padx=20, pady=20)

        table_container = ctk.CTkScrollableFrame(content_frame, fg_color="white", corner_radius=12, border_width=1, border_color="#e0e0e0")
        table_container.pack(side="left", fill="both", expand=True)

        h_frame = ctk.CTkFrame(table_container, fg_color="#1b4332", corner_radius=6)
        h_frame.pack(fill="x", pady=(0, 5))
        for h, w in zip(["ID", "Tarih", "Kategori", "Açıklama", "Tutar", "Durum"], [50, 100, 110, 180, 100, 90]):
            ctk.CTkLabel(h_frame, text=h, text_color="white", font=ctk.CTkFont(size=11, weight="bold"), width=w, anchor="w").pack(side="left", padx=6, pady=6)

        with db() as c:
            rows = c.execute("select * from expense order by id desc").fetchall()

        for r in rows:
            r_frame = ctk.CTkFrame(table_container, fg_color="#f8f9fa", corner_radius=4)
            r_frame.pack(fill="x", pady=2)
            row_vals = [str(r["id"]), r["tarih"], r["kategori"] or "", r["aciklama"] or "", tl(r["tutar"]), r["durum"] or ""]
            for val, w in zip(row_vals, [50, 100, 110, 180, 100, 90]):
                ctk.CTkLabel(r_frame, text=val, font=ctk.CTkFont(size=11), width=w, anchor="w").pack(side="left", padx=6, pady=5)

    def cash(self):
        self.clear()
        ctk.CTkLabel(self.main, text="🏦 Kasa Hareketleri", font=ctk.CTkFont(size=22, weight="bold"), text_color="#081c15").pack(anchor="w", pady=(0, 15))

        with db() as c:
            rows = c.execute("select * from cash order by id desc").fetchall()
            bal = sum(r["gelir"] - r["gider"] for r in rows)

        card = ctk.CTkFrame(self.main, fg_color="white", corner_radius=12, border_width=1, border_color="#e0e0e0")
        card.pack(fill="x", pady=(0, 15))
        ctk.CTkLabel(card, text="MEVCUT KASA BAKİYESİ", text_color="#6c757d", font=ctk.CTkFont(size=11, weight="bold")).pack(anchor="w", padx=20, pady=(12, 2))
        ctk.CTkLabel(card, text=tl(bal), text_color="#1b4332", font=ctk.CTkFont(size=22, weight="bold")).pack(anchor="w", padx=20, pady=(0, 12))

        table_container = ctk.CTkScrollableFrame(self.main, fg_color="white", corner_radius=12, border_width=1, border_color="#e0e0e0", height=450)
        table_container.pack(fill="both", expand=True, pady=10)

        h_frame = ctk.CTkFrame(table_container, fg_color="#1b4332", corner_radius=6)
        h_frame.pack(fill="x", pady=(0, 5))
        for h, w in zip(["ID", "Tarih", "Tür", "Açıklama", "Gelir", "Gider", "Net Bakiye"], [50, 100, 90, 240, 110, 110, 110]):
            ctk.CTkLabel(h_frame, text=h, text_color="white", font=ctk.CTkFont(size=11, weight="bold"), width=w, anchor="w").pack(side="left", padx=6, pady=6)

        for r in rows:
            r_frame = ctk.CTkFrame(table_container, fg_color="#f8f9fa", corner_radius=4)
            r_frame.pack(fill="x", pady=2)
            row_vals = [str(r["id"]), r["tarih"], r["tur"] or "", r["aciklama"] or "", tl(r["gelir"]), tl(r["gider"]), tl(r["gelir"] - r["gider"])]
            for val, w in zip(row_vals, [50, 100, 90, 240, 110, 110, 110]):
                ctk.CTkLabel(r_frame, text=val, font=ctk.CTkFont(size=11), width=w, anchor="w").pack(side="left", padx=6, pady=5)

    def records(self):
        self.clear()
        ctk.CTkLabel(self.main, text="📋 Tüm Hasat Kayıtları", font=ctk.CTkFont(size=22, weight="bold"), text_color="#081c15").pack(anchor="w", pady=(0, 15))

        table_container = ctk.CTkScrollableFrame(self.main, fg_color="white", corner_radius=12, border_width=1, border_color="#e0e0e0", height=520)
        table_container.pack(fill="both", expand=True, pady=10)

        with db() as c:
            rows = c.execute("select id, tarih, surum, uretici, kg, firma, fiyat, kg*fiyat x, tahsilat from harvest order by id desc").fetchall()

        headers = ["ID", "Tarih", "Sürüm", "Üretici", "KG", "Firma", "TL/KG", "Satış Tutarı", "Tahsilat"]
        h_frame = ctk.CTkFrame(table_container, fg_color="#1b4332", corner_radius=6)
        h_frame.pack(fill="x", pady=(0, 5))
        for h in headers:
            ctk.CTkLabel(h_frame, text=h, text_color="white", font=ctk.CTkFont(size=11, weight="bold"), width=110, anchor="w").pack(side="left", padx=6, pady=6)

        for r in rows:
            r_frame = ctk.CTkFrame(table_container, fg_color="#f8f9fa", corner_radius=4)
            r_frame.pack(fill="x", pady=2)
            row_vals = [str(r["id"]), r["tarih"], r["surum"] or "", r["uretici"], f"{r['kg']:,.2f}", r["firma"] or "", tl(r["fiyat"]), tl(r["x"]), tl(r["tahsilat"])]
            for val in row_vals:
                ctk.CTkLabel(r_frame, text=val, font=ctk.CTkFont(size=11), width=110, anchor="w").pack(side="left", padx=6, pady=5)

    def backup(self):
        try:
            drive = get_drive_instance()
            file_drive = drive.CreateFile({'title': f'cay_takip_yedek_{date.today().isoformat()}.db', 'parents': [{'id': 'root'}]})
            file_drive.SetContentFile(DB)
            file_drive.Upload()
            messagebox.showinfo("Başarılı", "Google Drive hesabınıza veritabanı başarıyla yedeklendi! ☁️")
        except Exception as e:
            messagebox.showerror("Hata", str(e))

    def restore_from_drive(self):
        if not messagebox.askyesno("Onay", "Drive'daki en son yedek indirilecek. Devam edilsin mi?"):
            return
        try:
            drive = get_drive_instance()
            file_list = drive.ListFile({'q': "title contains 'cay_takip_yedek_' and trashed=false"}).GetList()
            if not file_list:
                messagebox.showwarning("Bulunamadı", "Drive'da yedek bulunamadı.")
                return
            file_list.sort(key=lambda x: x['createdDate'], reverse=True)
            file_list[0].GetContentFile(DB)
            messagebox.showinfo("Başarılı", "Veriler Drive'dan çekildi ve güncellendi! 📥")
            self.dashboard()
        except Exception as e:
            messagebox.showerror("Hata", str(e))

    def import_csv(self):
        path = filedialog.askopenfilename(title="CSV Seç", filetypes=[("CSV", "*.csv")])
        if path:
            try:
                with db() as c:
                    with open(path, "r", encoding="utf-8-sig", newline="") as f:
                        reader = csv.DictReader(f)
                        for row in reader:
                            c.execute("INSERT INTO harvest(tarih, surum, uretici, kg, firma, fiyat, tahsilat, aciklama) VALUES(?,?,?,?,?,?,?,?)",
                                      (row.get("tarih",""), row.get("surum",""), row.get("uretici",""), float(row.get("kg",0) or 0),
                                       row.get("firma",""), float(row.get("fiyat",0) or 0), float(row.get("tahsilat",0) or 0), row.get("aciklama","")))
                messagebox.showinfo("Başarılı", "CSV İçe aktarıldı.")
                self.dashboard()
            except Exception as e:
                messagebox.showerror("Hata", str(e))

if __name__ == "__main__":
    app = App()
    app.mainloop()
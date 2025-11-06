from tkinter import *
from tkinter import filedialog, messagebox
import sqlite3, os, csv, sys

def on_mousewheel(event):
    canvas.yview_scroll(-1*(event.delta//120), "units")

def print_database():
    for row in rows:
        print(row)
        
def print_kolommen():
    kolom_index = kolommen_entry.get()
    try:
        kolom_index = int(kolom_index)
    except ValueError:
        messagebox.showwarning("Warning", "Dat is geen nummer!")
        return
    if kolom_index >= num_kolommen or kolom_index < 0:
        messagebox.showwarning("Warning", "Er zijn niet zoveel kolommen!")
        return
    query = f"""SELECT {kolommen[kolom_index]} FROM {filename};"""
    cursor.execute(query)
    kolom = cursor.fetchall()
    for value in kolom:
        print(value)

def print_rijen():
    rij_index = rijen_entry.get()
    try:
        rij_index = int(rij_index)
    except ValueError:
        messagebox.showwarning("Warning", "Dat is geen nummer!")
        return
    if rij_index >= len(rows) or rij_index < 0:
        messagebox.showwarning("Warning", "Er zijn niet zoveel rijen!")
        return
    print(rows[rij_index])
    
def on_entry_click(event, placeholder_text):
    entry = event.widget
    if entry.get() == placeholder_text:
        entry.delete(0, END)
        entry.config(fg='black')

def on_focus_out(event, placeholder_text):
    entry = event.widget
    if entry.get() == '':
        entry.insert(0, placeholder_text)
        entry.config(fg='grey')

def entry_changed(event, row_data, col_index):
    entry = event.widget
    entry_text = entry.get().strip()
    query = f"""
    UPDATE {filename}
    SET {kolommen[col_index]} = ?
    WHERE {kolommen[0]} = ?;
    """
    cursor.execute(query, (entry_text, row_data[0]))
    connection.commit()

# Create a hidden root for the file dialog to avoid multiple Tk instances
root = Tk()
root.withdraw()

file_path = filedialog.askopenfilename(parent=root, filetypes=[("SQLite and CSV databases", "*.db;*.csv"), ("All files", "*.*")])
if not file_path:
    messagebox.showinfo("Info", "No file selected. Exiting.")
    sys.exit(0)


if file_path.endswith(".csv"):
    filename = os.path.splitext(os.path.basename(file_path))[0]

    db_file = f"{filename}.db"
    with open(file_path, 'r', encoding='utf-8-sig') as file:
        reader = csv.reader(file)
        kolommen = next(reader)

    num_kolommen = len(kolommen)

    if os.path.exists(db_file):
        connection = sqlite3.connect(db_file)
        cursor = connection.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (filename,))
        result = cursor.fetchone()
        if result is None: 
            query = f"""CREATE TABLE {filename} ({', '.join([f'{kolom} TEXT' for kolom in kolommen])});"""
            cursor.execute(query)
            with open(file_path,'r', encoding='utf-8-sig') as file:
                reader = csv.reader(file)
                cursor.executemany(f"INSERT INTO {filename} VALUES ({', '.join(['?' for _ in range(num_kolommen)])})", reader)
        else:
            # Haalt alle tabellen
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = cursor.fetchall()
            # Verwijdert elke tabel in de database
            for table in tables:
                table_name = table[0]
                cursor.execute(f"DROP TABLE {table_name}")
            query = f"""CREATE TABLE {filename} ({', '.join([f'{kolom} TEXT' for kolom in kolommen])});"""
            cursor.execute(query)
            with open(file_path,'r', encoding='utf-8-sig') as file:
                reader = csv.reader(file)
                cursor.executemany(f"INSERT INTO {filename} VALUES ({', '.join(['?' for _ in range(num_kolommen)])})", reader)
    else:
        open(db_file, 'a').close()
        connection = sqlite3.connect(db_file)
        cursor = connection.cursor()
        query = f"""CREATE TABLE {filename} ({', '.join([f'{name} TEXT' for name in kolommen])});"""
        cursor.execute(query)
        with open(file_path,'r', encoding='utf-8-sig') as file:
            reader = csv.reader(file)
            cursor.executemany(f"INSERT INTO {filename} VALUES ({', '.join(['?' for _ in range(num_kolommen)])})", reader)
    connection.commit()
else:
    connection = sqlite3.connect(file_path)
    cursor = connection.cursor()
    # Haalt alle tabellen
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    if not tables:
        messagebox.showerror("Error", f"No tables found in database: {file_path}")
        cursor.close()
        connection.close()
        sys.exit(1)
    filename = tables[0][0]

    # Get column names for the selected table so the UI can reference them
    cursor.execute(f"PRAGMA table_info({filename})")
    cols = cursor.fetchall()
    kolommen = [c[1] for c in cols]
    num_kolommen = len(kolommen)

root.deiconify()
root.title('Database editor')

# Maakt de scrollbar
canvas = Canvas(root)
canvas.pack(side=LEFT, fill=BOTH, expand=1)
scrollbar_y = Scrollbar(root, orient=VERTICAL, command=canvas.yview)
scrollbar_y.pack(side=RIGHT, fill=Y)
canvas.configure(yscrollcommand=scrollbar_y.set)
canvas.bind_all("<MouseWheel>", on_mousewheel)
frame = Frame(canvas)
canvas.create_window((0, 0), window=frame, anchor="nw")

# Print de hele database naar de console
print_database_knop = Button(frame, text="Print database", command=print_database)
print_database_knop.grid(row=0, column=0)

# Print enkele kolommen naar de console
kolommen_placeholder_text = "Voer de kolomindex in"
kolommen_entry = Entry(frame, fg='black')
kolommen_entry.insert(0, kolommen_placeholder_text)
kolommen_entry.bind('<FocusIn>', lambda event, placeholder_text=kolommen_placeholder_text: on_entry_click(event, placeholder_text))
kolommen_entry.bind('<FocusOut>', lambda event, placeholder_text=kolommen_placeholder_text: on_focus_out(event, placeholder_text))
kolommen_entry.grid(row=0, column=1)
print_kolommen_knop = Button(frame, text="Print kolommen", command=print_kolommen)
print_kolommen_knop.grid(row=0, column=2)

# Print enkele rijen naar de console
rijen_placeholder_text = "Voer de rij-index in"
rijen_entry = Entry(frame, fg='black')
rijen_entry.insert(0, rijen_placeholder_text)
rijen_entry.bind('<FocusIn>', lambda event, placeholder_text=rijen_placeholder_text: on_entry_click(event, placeholder_text))
rijen_entry.bind('<FocusOut>', lambda event, placeholder_text=rijen_placeholder_text: on_focus_out(event, placeholder_text))
rijen_entry.grid(row=0, column=3)
print_rijen_knop = Button(frame, text="Print rijen", command=print_rijen)
print_rijen_knop.grid(row=0, column=4)

# Voert een SQL-query uit om gegevens uit de tabel op te halen
cursor.execute(f"SELECT * FROM {filename}")
rows = cursor.fetchall()

# Opgehaalde gegevens weergeven via tabellen
for row_index, row_data in enumerate(rows):
    for col_index, col_data in enumerate(row_data):
        entry = Entry(frame)
        # Ensure we insert a string (None or bytes can cause Tcl errors)
        text = '' if col_data is None else str(col_data)
        entry.insert(END, text)
        entry.grid(row=row_index + 1, column=col_index)
        entry.bind("<KeyRelease>", lambda event, row_data=row_data, col_index=col_index: entry_changed(event, row_data, col_index))

frame.update_idletasks()
canvas.configure(scrollregion=canvas.bbox("all"))

# Begint de hoofdlus
root.mainloop()

# Sluit de databaseverbinding
cursor.close()
connection.close()
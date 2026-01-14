from flask import Flask, render_template, request, redirect, url_for, session, flash
import json
import os
from functools import wraps

app = Flask(__name__)
app.secret_key = 'bingo_secret_key'
USER_DATA_FILE = 'users.json'

def load_users():
    if not os.path.exists(USER_DATA_FILE):
        return {}
    with open(USER_DATA_FILE, 'r') as f:
        return json.load(f)

def save_users(users):
    with open(USER_DATA_FILE, 'w') as f:
        json.dump(users, f, indent=4)

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_phone' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/')
def index():
    if 'user_phone' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        phone = request.form.get('phone')
        password = request.form.get('password')
        name = request.form.get('name')
        
        users = load_users()
        if phone in users:
            flash('Phone number already exists')
            return redirect(url_for('signup'))
        
        users[phone] = {
            'name': name,
            'password': password,
            'balance': 0
        }
        save_users(users)
        session['user_phone'] = phone
        return redirect(url_for('dashboard'))
    return render_template('signup.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        phone = request.form.get('phone')
        password = request.form.get('password')
        
        users = load_users()
        if phone in users and users[phone]['password'] == password:
            session['user_phone'] = phone
            return redirect(url_for('dashboard'))
        flash('Invalid phone or password')
    return render_template('login.html')

@app.route('/dashboard')
@login_required
def dashboard():
    users = load_users()
    user = users.get(session['user_phone'])
    return render_template('dashboard.html', user=user)

@app.route('/logout')
def logout():
    session.pop('user_phone', None)
    return redirect(url_for('login'))

@app.route('/admin', methods=['GET', 'POST'])
def admin():
    users = load_users()
    if request.method == 'POST':
        phone = request.form.get('phone')
        new_balance = request.form.get('balance')
        if phone in users:
            try:
                users[phone]['balance'] = float(new_balance)
                save_users(users)
                flash(f'Updated balance for {phone}')
            except ValueError:
                flash('Invalid balance amount')
        else:
            flash('User not found')
    return render_template('admin.html', users=users)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)

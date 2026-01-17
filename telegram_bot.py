import os
import telebot
from telebot import types
import psycopg2
from dotenv import load_dotenv
import bcrypt

load_dotenv()

TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
DATABASE_URL = os.getenv('DATABASE_URL')

bot = telebot.TeleBot(TOKEN, threaded=False)

# Store user state temporarily (In production, use Redis or a DB table)
user_states = {}

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

@bot.message_handler(commands=['start'])
def start(message):
    markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
    button = types.KeyboardButton("Share Contact to Register", request_contact=True)
    markup.add(button)
    
    bot.send_message(
        message.chat.id, 
        "እንኳን ወደ Fidel Bingo በሰላም መጡ! ለመመዝገብ እባክዎ ከታች ያለውን 'Share Contact to Register' የሚለውን ቁልፍ ይጫኑ።", 
        reply_markup=markup
    )

@bot.message_handler(content_types=['contact'])
def handle_contact(message):
    if message.contact is not None:
        chat_id = str(message.chat.id)
        phone = message.contact.phone_number
        
        # Clean phone number (remove +)
        if phone.startswith('+'):
            phone = phone[1:]
        # Normalize phone (251... to 09...)
        if phone.startswith('251'):
            phone = '0' + phone[3:]

        # Save state and ask for password
        user_states[chat_id] = {'phone': phone, 'step': 'password'}
        
        bot.send_message(
            message.chat.id, 
            "እባክዎ ለሂሳብዎ የሚሆን ምስጢር ቁጥር (Password) ያስገቡ፡",
            reply_markup=types.ReplyKeyboardRemove()
        )

@bot.message_handler(func=lambda message: user_states.get(str(message.chat.id), {}).get('step') == 'password')
def handle_password(message):
    chat_id = str(message.chat.id)
    password = message.text
    phone = user_states[chat_id]['phone']
    
    try:
        # Hash password
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if user already exists
        cur.execute("SELECT id FROM users WHERE phone_number = %s", (phone,))
        existing_user = cur.fetchone()
        
        if existing_user:
            # Update existing user
            cur.execute(
                "UPDATE users SET password_hash = %s, telegram_chat_id = %s WHERE id = %s",
                (hashed, chat_id, existing_user[0])
            )
        else:
            # Create new user
            username = f"user_{phone[-4:]}"
            cur.execute(
                "INSERT INTO users (phone_number, password_hash, username, name, balance, telegram_chat_id) VALUES (%s, %s, %s, %s, 0, %s)",
                (phone, hashed, username, username, chat_id)
            )
        
        conn.commit()
        cur.close()
        conn.close()
        
        # Clear state
        del user_states[chat_id]
        
        bot.send_message(
            message.chat.id, 
            f"ምዝገባው ተጠናቋል! አሁን በስልክ ቁጥርዎ ({phone}) እና በመረጡት የገቡት ምስጢር ቁጥር (Password) መጠቀም ይችላሉ።\n\nለመጫወት ይህንን ሊንክ ይጫኑ፡ https://f8f3f826-54e0-4041-b327-2bc772ec9452-00-1qr0kb4ib98ue.worf.replit.dev",
            reply_markup=types.ReplyKeyboardRemove()
        )
        
    except Exception as e:
        print(f"Error saving user: {e}")
        bot.send_message(message.chat.id, "ስህተት አጋጥሟል። እባክዎ ቆይተው ይሞክሩ።")

if __name__ == "__main__":
    print("Bot is starting...")
    bot.infinity_polling()

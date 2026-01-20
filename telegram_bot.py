import os
import telebot
from telebot import types
import psycopg2
from dotenv import load_dotenv
import random

load_dotenv()

TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
DATABASE_URL = os.getenv('DATABASE_URL')

bot = telebot.TeleBot(TOKEN, threaded=False)

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

@bot.message_handler(commands=['start'])
def start(message):
    chat_id = str(message.chat.id)
    
    # Send Chat ID immediately
    msg = (
        "እንኳን ወደ Fidel Bingo በሰላም መጡ!\n\n"
        f"የእርስዎ ቻት አይዲ (Chat ID)፡ `{chat_id}` 👈\n\n"
        "እባክዎ ይህንን ኮፒ አድርገው አፑ ላይ ይመዝገቡ።"
    )
    
    markup = types.InlineKeyboardMarkup()
    # Constructing URL based on the Replit project domain
    import os
    # Prefer REPL_ID based domain as it's more stable in modern Replit
    repl_id = os.environ.get('REPL_ID')
    repl_slug = os.environ.get('REPL_SLUG', 'workspace')
    repl_owner = os.environ.get('REPL_OWNER')
    
    # Modern Replit public URL format
    if repl_owner and repl_slug:
        web_url = f"https://{repl_slug}.{repl_owner}.repl.co"
    else:
        web_url = "https://fidel-bingo.replit.app"
    
    web_button = types.InlineKeyboardButton("ዌብሳይት ለመክፈት ይጫኑ (Open Website)", url=web_url)
    markup.add(web_button)
    
    bot.send_message(message.chat.id, msg, parse_mode='Markdown', reply_markup=markup)

@bot.message_handler(commands=['otp'])
def send_otp(message):
    chat_id = str(message.chat.id)
    otp = str(random.randint(100000, 999999))
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # Update OTP for the user with this chat_id
        cur.execute("UPDATE users SET otp = %s WHERE telegram_chat_id = %s", (otp, chat_id))
        conn.commit()
        cur.close()
        conn.close()
        
        bot.send_message(message.chat.id, f"የእርስዎ የማረጋገጫ ኮድ (OTP)፡ `{otp}`", parse_mode='Markdown')
    except Exception as e:
        print(f"Error sending OTP: {e}")
        bot.send_message(message.chat.id, "ይቅርታ፣ ስህተት ተፈጥሯል። እባክዎ እንደገና ይሞክሩ።")

if __name__ == "__main__":
    print("Bot is starting...")
    bot.infinity_polling()

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
    # Replit provides REPLIT_DEV_DOMAIN which is the most reliable way to get the public URL
    web_url = os.environ.get('REPLIT_DEV_DOMAIN')
    if web_url:
        if not web_url.startswith('http'):
            web_url = f"https://{web_url}"
    else:
        # Fallback to slug/owner if domain is not set
        repl_slug = os.environ.get('REPL_SLUG', 'workspace')
        repl_owner = os.environ.get('REPL_OWNER')
        if repl_owner:
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

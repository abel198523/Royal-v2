import os
import telebot
from telebot import types
import psycopg2
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
DATABASE_URL = os.getenv('DATABASE_URL')

bot = telebot.TeleBot(TOKEN, threaded=False)

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
        search_phone = phone
        if phone.startswith('251'):
            search_phone = '0' + phone[3:]

        try:
            conn = get_db_connection()
            cur = conn.cursor()
            
            # Check if user exists
            cur.execute("SELECT id, name FROM users WHERE phone_number = %s OR phone_number = %s", (search_phone, phone))
            user = cur.fetchone()
            
            if user:
                user_id, name = user
                # Update telegram_chat_id
                cur.execute("UPDATE users SET telegram_chat_id = %s WHERE id = %s", (chat_id, user_id))
                conn.commit()
                
                bot.send_message(
                    message.chat.id, 
                    f"ምዝገባው ተጠናቋል! ሰላም {name}፣ የቴሌግራም አካውንትዎ (ID: {chat_id}) ከሂሳብዎ ጋር በትክክል ተገናኝቷል።\n\nለመጫወት ይህንን ሊንክ ይጫኑ፡ https://f8f3f826-54e0-4041-b327-2bc772ec9452-00-1qr0kb4ib98ue.worf.replit.dev",
                    reply_markup=types.ReplyKeyboardRemove()
                )
            else:
                bot.send_message(
                    message.chat.id, 
                    "ይቅርታ፣ ይህ ስልክ ቁጥር በሲስተሙ ላይ አልተገኘም። እባክዎ መጀመሪያ በዌብሳይቱ ላይ ይመዝገቡ።",
                    reply_markup=types.ReplyKeyboardRemove()
                )
            
            cur.close()
            conn.close()
        except Exception as e:
            print(f"Error: {e}")
            bot.send_message(message.chat.id, "ስህተት አጋጥሟል። እባክዎ ቆይተው ይሞክሩ።")

if __name__ == "__main__":
    print("Bot is starting...")
    bot.infinity_polling()

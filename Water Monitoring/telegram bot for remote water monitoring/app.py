from __future__ import print_function
from googleapiclient.discovery import build
from httplib2 import Http
from oauth2client import file, client, tools
import requests as re
import json
from pprint import pprint
import time

#Preparing google sheets
# If modifying these scopes, delete the file token.json.
SCOPES = 'https://www.googleapis.com/auth/spreadsheets'

store = file.Storage('token.json')
creds = store.get()
if not creds or creds.invalid:
    flow = client.flow_from_clientsecrets('credentials.json', SCOPES)
    creds = tools.run_flow(flow, store)
service = build('sheets', 'v4', http=creds.authorize(Http()))

    # Call the Sheets API
#SPREADSHEET_ID = '10U1a9fKZIMG5rcgbCyO0XTeAPkCo59-z4u9slES9mRU'
#RANGE_NAME = 'GPS!A2:D'
    
#spreadsheet_id = '10U1a9fKZIMG5rcgbCyO0XTeAPkCo59-z4u9slES9mRU'  # TODO: Update placeholder value.
spreadsheet_id = '1Z8WSberp2ojjwsofapaXzL9Os3uN-mCAmljU0xrZU50'
# The A1 notation of a range to search for a logical table of data.
# Values will be appended after the last row of the table.
range_ = 'GPS!A2:D'  # TODO: Update placeholder value.

# How the input data should be interpreted.
value_input_option = 'USER_ENTERED'  # TODO: Update placeholder value.

# How the input data should be inserted.
insert_data_option = 'INSERT_ROWS'  # TODO: Update placeholder value.
#Prepared google sheets

#Preparing telegram api
token = '643620598:AAGFmAw88DpoVaWssY_w4wcdFzntFiOI5N4'
url = "https://api.telegram.org/bot{}/".format(token)
#prepared telegram api

d_id = 0
records = {}
history = {}
#pulling messages that are received after the last pulling event
def get_new_logs(offset=None):
    url_temp = url+"getUpdates"
    if offset:
        url_temp+="?offset={}".format(offset)
    response = re.get(url_temp)
    print(url_temp)
    content = response.content.decode("utf8")
    content = json.loads(content)   
    return content

def get_last_update_id(updates):
    update_ids = []
    for update in updates["result"]:
        update_ids.append(int(update["update_id"]))
    return max(update_ids)

#handling the new messages
def handle_updates(updates):
    for update in updates["result"]:
        if 'message' in update:
            drone_id = str(update['message']['from']['id'])
            datetime = update['message']['date']
            loc = {}
            if 'location' in update['message']:
                loc['lat']=update['message']['location']['latitude']
                loc['lon']=update['message']['location']['longitude']
                if(drone_id not in records):
                    records[drone_id] = []
                records[drone_id].append((datetime,loc))
                values = [
                    [
                        drone_id,datetime,loc['lat'],loc['lon']
                    ],
                    # Additional rows ...
                ]
                value_range_body = {
                    # TODO: Add desired entries to the request body.
                     'values': values
                }
                request = service.spreadsheets().values().append(spreadsheetId=spreadsheet_id, range=range_, valueInputOption=value_input_option, insertDataOption=insert_data_option, body=value_range_body)
                response = request.execute()
                pprint(response)
            else:
                continue
        else:
            continue


last_update_id = None
while True:
    updates = get_new_logs(last_update_id)
    if len(updates["result"]) > 0:
        last_update_id = get_last_update_id(updates) + 1
        handle_updates(updates)
    time.sleep(0.5)

'''
updates = get_new_logs()
handle_updates(updates)        
'''
'''
values = [
    [
        '123451',1233422,23.12,55.5
    ],
    # Additional rows ...
]

value_range_body = {
    # TODO: Add desired entries to the request body.
    'values': values
}

request = service.spreadsheets().values().append(spreadsheetId=spreadsheet_id, range=range_, valueInputOption=value_input_option, insertDataOption=insert_data_option, body=value_range_body)
response = request.execute()

# TODO: Change code below to process the `response` dict:
pprint(response)
'''

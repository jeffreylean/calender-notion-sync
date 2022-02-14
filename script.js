const database_id = "database_id";
const notion_secret_key = "notion_intergration_secret_key;
const onlyDateRegex = /(\d{4})-(\d{2})-(\d{2})\b/;
const dateTimeRegex =
  /(\d{4})-(\d{2})-(\d{2})T(\d{2})\:(\d{2})\:(\d{2})\.(\d{3})\+(\d{2})\:(\d{2})\b/;
const calendar = CalendarApp.getDefaultCalendar();

function calendarSyncToNotion() {
  //check if there is any event to be deleted
  deleteEventNotion(calendar);

  // Get latest event
  var events = Calendar.Events.list(calendar.getId(), { orderBy: "updated" });
  var event = events.items[events.items.length - 1];

  //check duplicates
  var resp = searchEventNotion(
    event.start.dateTime,
    event.end.dateTime,
    event.summary
  );
  // sync to notion
  if (resp.length == 0) {
    createEventNotion(event.start.dateTime, event.end.dateTime, event.summary);
  }
}

function notionSyncToCalendar() {
  let data = {
    filter: {
      property: "Date",
      date: {
        is_not_empty: true,
      },
    },
  };

  let options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + notion_secret_key,
      "Notion-Version": "2021-08-16",
      "Content-Type": "application/json",
    },
    payload: JSON.stringify(data),
  };
  let resp = UrlFetchApp.fetch(
    "https://api.notion.com/v1/databases/" + database_id + "/query",
    options
  );
  resp = JSON.parse(resp.getContentText());

  for (let i = 0; i < resp.results.length; i++) {
    let pageId =
      resp.results[i].id + " in database " + resp.results[i].parent.database_id;
    let event = searchEventCalendar(pageId);
    if (event === null) createEventCalendar(resp.results[i]);
    else updateEventCalendar(event, resp.results[i]);
  }
}

//google calendar
function searchEventCalendar(str) {
  let events = calendar.getEvents(new Date("1970-1-1"), new Date("2100-1-1"), {
    search: str,
  });
  if (events.length > 1) throw new Error("uuid duplicate in search");
  if (events.length === 0) return null;
  return events[0];
}

function createEventCalendar(page) {
  let date = page.properties.Date;
  let title = "";
  page.properties.Name.title.forEach((rich_text) => {
    title += rich_text.plain_text;
  });

  let pageId = page.id + " in database " + page.parent.database_id;

  let startDate = date.date.start;
  let endDate = date.date.end;
  let startDateObj = new Date(startDate);
  let endDateObj = new Date(endDate);

  let event;
  Logger.log("Create page " + title);

  if (date.date.end !== null) {
    if (onlyDateRegex.test(startDate))
      event = calendar.createAllDayEvent(title, startDateObj, endDateObj);

    if (dateTimeRegex.test(startDate))
      event = calendar.createEvent(title, startDateObj, endDateObj);
  } else {
    if (onlyDateRegex.test(startDate))
      event = calendar.createAllDayEvent(title, startDateObj);

    if (dateTimeRegex.test(startDate))
      event = calendar.createEvent(title, startDateObj, startDateObj);
  }
  event.setDescription(pageId);
}

function updateEventCalendar(event, page) {
  let date = page.properties.Date;
  let title = "";
  page.properties.Name.title.forEach((rich_text) => {
    title += rich_text.plain_text;
  });

  Logger.log("Update page " + title);

  let startDate = date.date.start;
  let endDate = date.date.end;
  let startDateObj = new Date(startDate);
  let endDateObj = new Date(endDate);

  if (date.date.end !== null) {
    if (onlyDateRegex.test(startDate)) {
      startDateObj.setHours(0, 0, 0, 0);
      endDateObj.setHours(0, 0, 0, 0);

      if (event.isAllDayEvent()) {
        if (
          event.getAllDayStartDate().getTime() !== startDateObj.getTime() ||
          event.getAllDayEndDate().getTime() !== endDateObj.getTime()
        ) {
          Logger.log(
            "update allDayStartDate " +
              event.getAllDayStartDate() +
              " to " +
              startDateObj
          );
          Logger.log(
            "update allDayEndDate " +
              event.getAllDayEndDate() +
              " to " +
              endDateObj
          );
          event.setAllDayDates(startDateObj, endDateObj);
        }
      } else event.setAllDayDates(startDateObj, endDateObj);
    }
    if (dateTimeRegex.test(startDate)) {
      if (event.isAllDayEvent()) {
        Logger.log(
          "change to dateTime, start: " + startDateObj + " end: " + endDateObj
        );
        event.setTime(startDateObj, endDateObj);
      } else {
        if (
          event.getStartTime().getTime() !== startDateObj.getTime() ||
          event.getEndTime().getTime() !== endDateObj.getTime()
        ) {
          Logger.log(
            "update dateTime, start: " + startDateObj + " end: " + endDateObj
          );
          event.setTime(startDateObj, endDateObj);
        }
      }
    }
  } else {
    if (onlyDateRegex.test(startDate)) {
      startDateObj.setHours(0, 0, 0, 0);

      if (event.isAllDayEvent()) {
        if (
          event.getAllDayStartDate().getTime() !== startDateObj.getTime() ||
          event.getAllDayEndDate().getTime() !== startDateObj.getTime()
        ) {
          Logger.log(
            "update allOneDayDate " +
              event.getAllDayStartDate() +
              " to " +
              startDateObj
          );
          event.setAllDayDate(startDateObj);
        }
      } else {
        Logger.log("change to allOneDayDate: " + startDateObj);
        event.setAllDayDates(startDateObj);
      }
    }
    if (dateTimeRegex.test(startDate)) {
      if (event.isAllDayEvent()) {
        Logger.log("change to dateTime: " + startDateObj);
        event.setTime(startDateObj, startDateObj);
      } else {
        if (event.getStartTime().getTime() !== startDateObj.getTime()) {
          Logger.log("update dateTime: " + startDateObj);
          event.setTime(startDateObj, startDateObj);
        }
      }
    }
    if (event.getTitle() !== title) {
      Logger.log('update title: "' + event.getTitle() + '" to ' + title);
      event.setTitle(title);
    }
  }
}

//notion
function searchEventNotion(startDateTime, endDateTime, title) {
  var data = JSON.stringify({
    filter: {
      and: [
        {
          property: "Date",
          date: {
            after: startDateTime,
            before: endDateTime,
          },
        },
        {
          property: "Name",
          text: {
            equals: title,
          },
        },
      ],
    },
  });

  let options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + notion_secret_key,
      "Notion-Version": "2021-08-16",
      "Content-Type": "application/json",
    },
    payload: data,
  };
  let response = UrlFetchApp.fetch(
    "https://api.notion.com/v1/databases/" + database_id + "/query",
    options
  );
  response = JSON.parse(response.getContentText());

  return response.results;
}

function deleteEventNotion(calendar) {
  var deletedEvents = Calendar.Events.list(calendar.getId(), {
    showDeleted: true,
    orderBy: "updated",
  });

  var latestDeletedEvent = deletedEvents.items[deletedEvents.items.length - 1];
  //check whether is deleted in notion, if not then delete it
  var events = searchEventNotion(
    latestDeletedEvent.start.dateTime,
    latestDeletedEvent.end.dateTime,
    latestDeletedEvent.summary
  );
  if (events.length > 0) {
    var event = events[events.length - 1];
    var data = JSON.stringify({
      archived: true,
    });

    let options = {
      method: "patch",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + notion_secret_key,
        "Notion-Version": "2021-08-16",
        "Content-Type": "application/json",
      },
      payload: data,
    };
    let response = UrlFetchApp.fetch(
      "https://api.notion.com/v1/pages/" + event.id,
      options
    );
    response = JSON.parse(response.getContentText());
    Logger.log(response);
  }
}

function createEventNotion(startDateTime, endDateTime, title) {
  var data = JSON.stringify({
    parent: {
      type: "database_id",
      database_id: database_id,
    },
    properties: {
      Date: {
        type: "date",
        date: {
          start: startDateTime,
          end: endDateTime,
          time_zone: null,
        },
      },
      Tags: {
        type: "multi_select",
        multi_select: [],
      },
      Name: {
        type: "title",
        title: [
          {
            type: "text",
            text: {
              content: title,
              link: null,
            },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "default",
            },
            plain_text: "test",
            href: null,
          },
        ],
      },
    },
  });

  let options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + notion_secret_key,
      "Notion-Version": "2021-08-16",
      "Content-Type": "application/json",
    },
    payload: data,
  };
  let response = UrlFetchApp.fetch("https://api.notion.com/v1/pages", options);
  response = JSON.parse(response.getContentText());
  Logger.log(response);
}

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import { toDate } from "date-fns-tz";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const EVENTBRITE_TOKEN = process.env.EVENTBRITE_PRIVATE_TOKEN;
  const ORG_ID = "1937809150453";
  const TEMPLATE_EVENT_ID = "1986677712518";

  const ebClient = axios.create({
    baseURL: "https://www.eventbriteapi.com/v3",
    headers: {
      Authorization: `Bearer ${EVENTBRITE_TOKEN}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  });

  // API routes
  app.post("/api/eventbrite/prepare", async (req, res) => {
    try {
      const { title, summary, start_time, end_time, location_name } = req.body;

      if (!EVENTBRITE_TOKEN) {
        return res.status(500).json({ error: "EVENTBRITE_PRIVATE_TOKEN is not configured." });
      }

      // 1. Copy template event
      console.log(`Copying event ${TEMPLATE_EVENT_ID}...`);
      // The Eventbrite API for copying an event is POST /v3/events/:event_id/copy/
      const copyResponse = await ebClient.post(`/events/${TEMPLATE_EVENT_ID}/copy/`);
      const newEventId = copyResponse.data.id;

      // 2. Handle Venue (Location)
      let venueId = null;
      if (location_name) {
        try {
          console.log(`Creating venue for ${location_name}...`);
          // Note: Eventbrite venues require specific address fields. 
          // If only a name is provided, we use it as address_1 and name.
          const venueResponse = await ebClient.post(`/organizations/${ORG_ID}/venues/`, {
            venue: {
              name: location_name,
              address: {
                address_1: location_name,
                city: "Online", 
                region: "CA",
                postal_code: "90001",
                country: "US"
              }
            }
          });
          venueId = venueResponse.data.id;
        } catch (venueErr: any) {
          console.warn("Venue creation failed, will try to update event without it:", venueErr.response?.data || venueErr.message);
        }
      }

      // 3. Update the copied event
      console.log(`Updating event ${newEventId}...`);
      // According to documentation, we should ensure the event is in a state that allows updates.
      // Copied events are usually in 'draft' status.
      const localToUtc = (localStr: string, timeZone: string) => {
        const date = toDate(localStr, { timeZone });
        return date.toISOString().replace(/\.000Z$/, 'Z');
      };

      const updateData: any = {
        event: {
          name: { html: title },
          summary: summary,
          start: {
            timezone: "America/Los_Angeles",
            utc: localToUtc(start_time, "America/Los_Angeles"),
          },
          end: {
            timezone: "America/Los_Angeles",
            utc: localToUtc(end_time, "America/Los_Angeles"),
          },
          listed: true,
          shareable: true
        },
      };

      if (venueId) {
        updateData.event.venue_id = venueId;
      }

      const updateResponse = await ebClient.post(`/events/${newEventId}/`, updateData);
      
      res.json({
        id: newEventId,
        url: updateResponse.data.url,
        status: updateResponse.data.status,
      });
    } catch (error: any) {
      console.error("Eventbrite Prepare Error:", error.response?.data || error.message);
      res.status(500).json({ error: error.response?.data?.error_description || "Failed to prepare event" });
    }
  });

  app.post("/api/eventbrite/update", async (req, res) => {
    try {
      const { event_id, title, summary, start_time, end_time, location_name } = req.body;

      if (!EVENTBRITE_TOKEN) {
        return res.status(500).json({ error: "EVENTBRITE_PRIVATE_TOKEN is not configured." });
      }

      if (!event_id) {
        return res.status(400).json({ error: "event_id is required." });
      }

      let venueId = null;
      if (location_name) {
        try {
          console.log(`Creating venue for ${location_name}...`);
          const venueResponse = await ebClient.post(`/organizations/${ORG_ID}/venues/`, {
            venue: {
              name: location_name,
              address: {
                address_1: location_name,
                city: "Online", 
                region: "CA",
                postal_code: "90001",
                country: "US"
              }
            }
          });
          venueId = venueResponse.data.id;
        } catch (venueErr: any) {
          console.warn("Venue creation failed:", venueErr.response?.data || venueErr.message);
        }
      }

      const localToUtc = (localStr: string, timeZone: string) => {
        const date = toDate(localStr, { timeZone });
        return date.toISOString().replace(/\.000Z$/, 'Z');
      };

      console.log(`Updating event ${event_id}...`);
      const updateData: any = { event: {} };
      if (title) updateData.event.name = { html: title };
      if (summary) updateData.event.summary = summary;
      if (start_time) updateData.event.start = { timezone: "America/Los_Angeles", utc: localToUtc(start_time, "America/Los_Angeles") };
      if (end_time) updateData.event.end = { timezone: "America/Los_Angeles", utc: localToUtc(end_time, "America/Los_Angeles") };
      if (venueId) updateData.event.venue_id = venueId;

      if (Object.keys(updateData.event).length === 0) {
        return res.status(400).json({ error: "No fields to update." });
      }

      const updateResponse = await ebClient.post(`/events/${event_id}/`, updateData);
      
      res.json({
        id: event_id,
        url: updateResponse.data.url,
        status: updateResponse.data.status,
      });
    } catch (error: any) {
      console.error("Eventbrite Update Error:", error.response?.data || error.message);
      res.status(500).json({ error: error.response?.data?.error_description || "Failed to update event" });
    }
  });

  app.post("/api/eventbrite/publish", async (req, res) => {
    try {
      const { event_id } = req.body;
      if (!EVENTBRITE_TOKEN) {
        return res.status(500).json({ error: "EVENTBRITE_PRIVATE_TOKEN is not configured." });
      }

      console.log(`Publishing event ${event_id}...`);
      const publishResponse = await ebClient.post(`/events/${event_id}/publish/`);
      
      res.json({ success: true, status: publishResponse.data.published });
    } catch (error: any) {
      console.error("Eventbrite Publish Error:", error.response?.data || error.message);
      res.status(500).json({ error: error.response?.data?.error_description || "Failed to publish event" });
    }
  });

  app.get("/api/eventbrite/latest", async (req, res) => {
    try {
      if (!EVENTBRITE_TOKEN) {
        return res.status(500).json({ error: "EVENTBRITE_PRIVATE_TOKEN is not configured." });
      }

      console.log(`Fetching latest event for organization ${ORG_ID}...`);
      
      let hasMore = true;
      let continuation = '';
      let latestEvent = null;
      
      while (hasMore) {
        const response = await ebClient.get(`/organizations/${ORG_ID}/events/`, {
          params: continuation ? { continuation } : {}
        });
        
        const events = response.data.events || [];
        if (events.length > 0) {
          // The default order is created_asc, so the last event in the last page is the latest
          latestEvent = events[events.length - 1];
        }
        
        hasMore = response.data.pagination.has_more_items;
        continuation = response.data.pagination.continuation;
      }
      
      if (!latestEvent) {
        return res.json({ message: "No events found for this organization." });
      }
      
      res.json({
        id: latestEvent.id,
        name: latestEvent.name?.text,
        url: latestEvent.url,
        start: latestEvent.start?.utc,
        end: latestEvent.end?.utc,
        status: latestEvent.status,
        created: latestEvent.created
      });
    } catch (error: any) {
      console.error("Eventbrite Latest Event Error:", error.response?.data || error.message);
      res.status(500).json({ error: error.response?.data?.error_description || "Failed to fetch latest event" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

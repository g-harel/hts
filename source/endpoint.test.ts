import express from "express";
import supertest from "supertest";

import {Client, Endpoint} from "..";
import {LinkRequest} from "../link";
import {Config} from "./endpoint";

describe("call", () => {
    let link: jest.SpyInstance;
    let lastSent: LinkRequest;
    let client: Client;

    beforeEach(() => {
        client = new Client();
        link = jest.fn(async (request) => {
            lastSent = request;
            return {status: 200, body: "{}"};
        });
        client.use(link as any);
    });

    it("should pass along request data to the link", async () => {
        const path = "/path123";
        const request = {
            test: true,
            list: [0, "test", null],
        };
        await new Endpoint({client, path}).call(request);
        expect(lastSent.headers["Content-Type"]).toContain("application/json");
        expect(lastSent.body).toBe(JSON.stringify(request));
    });

    it("should use the configured http method", async () => {
        const config: Config = {
            client,
            method: "HEAD",
            path: "/path123",
        };
        await new Endpoint(config).call({});
        expect(lastSent.method).toBe(config.method);
    });

    it("should throw an error if the status code not expected", async () => {
        const config: Config = {
            client,
            path: "/path123",
            expect: [301, 302],
        };
        link.mockReturnValueOnce({
            status: 400,
            body: "{}",
        });
        const endpoint = new Endpoint(config);
        await expect(endpoint.call({})).rejects.toThrow(/status.*400/);
    });
});

describe("handler", () => {
    let app: express.Express;
    let client: Client;

    beforeEach(() => {
        app = express();
        client = new Client();
    });

    it("should run handler when endpoint is called", async () => {
        const path = "/path123";
        const test = jest.fn(() => {});
        const endpoint = new Endpoint({client, path});
        app.use(endpoint.handler(test));

        await supertest(app)
            .post(path)
            .send("{}");
        expect(test).toHaveBeenCalled();
    });

    it("should match with the full request path when handling on a base", async () => {
        const base = "/very/nested";
        const path = base + "/path";
        const test = jest.fn(() => {});
        const endpoint = new Endpoint({client, path});
        app.use(base, endpoint.handler(test));

        await supertest(app)
            .post(path)
            .send("{}");
        expect(test).toHaveBeenCalled();
    });

    it("should only run handler when endpoint is matched", async () => {
        const path1 = "/path1";
        const test1 = jest.fn(() => {});
        const endpoint1 = new Endpoint({
            client,
            method: "PUT",
            path: path1,
        });
        app.use(endpoint1.handler(test1));

        const test2 = jest.fn(() => {});
        const endpoint2 = new Endpoint({client, path: path1});
        app.use(endpoint2.handler(test2));

        const path3 = "/path3";
        const test3 = jest.fn(() => {});
        const endpoint3 = new Endpoint({client, path: path3});
        app.use(endpoint3.handler(test3));

        // Test non-matching path.
        await supertest(app)
            .post(path3)
            .send("{}");
        expect(test1).not.toHaveBeenCalled();
        expect(test2).not.toHaveBeenCalled();
        expect(test3).toHaveBeenCalled();

        // Test non-matching method.
        await supertest(app)
            .post(path1)
            .send("{}");
        expect(test1).not.toHaveBeenCalled();
        expect(test2).toHaveBeenCalled();
    });

    it("should call handler with the parsed request payload", async () => {
        const path = "/path";
        const test = jest.fn(() => {});
        const payload = {test: true, arr: [0, ""]};
        const endpoint = new Endpoint({client, path});
        app.use(endpoint.handler(test));

        await supertest(app)
            .post(path)
            .send(JSON.stringify(payload));
        expect(test.mock.calls[0][0]).toEqual(payload);
    });

    it("should respond with stringified response from handler", async () => {
        const path = "/path";
        const payload = {test: true, arr: [0, ""]};
        const endpoint = new Endpoint({client, path});
        app.use(endpoint.handler(() => payload));

        const response = await supertest(app)
            .post(path)
            .send("{}");
        expect(response.header["content-type"]).toContain("application/json");
        expect(response.body).toEqual(payload);
    });

    it("should respond with stringified response from handler", async () => {
        const path = "/path";
        const payload = {test: true, arr: [0, ""]};
        const endpoint = new Endpoint({client, path});
        app.use(endpoint.handler(() => payload));

        const response = await supertest(app)
            .post(path)
            .send("{}");
        expect(response.body).toEqual(payload);
    });

    it("should defer errors to express", async () => {
        const path = "/path";
        const test = jest.fn();
        const error = new Error("test");
        const endpoint = new Endpoint({client, path});
        app.use(
            endpoint.handler(() => {
                throw error;
            }),
        );
        app.use((err: any, _0: any, res: any, _1: any) => {
            test(err);
            res.sendStatus(200);
            return;
        });

        await supertest(app)
            .post(path)
            .send("{}");
        expect(test.mock.calls[0][0].toString()).toMatch(error.toString());
    });
});
import axios from "axios";

const rawUrl = process.env.REACT_APP_API_URL || "http://localhost:5000";
export const url = rawUrl.replace(/\/?$/, "/");

export const axiosInstance = axios.create({
    headers: {
        authorization: `Bearer ${localStorage.getItem('token')}`
    }
});

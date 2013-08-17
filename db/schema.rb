# encoding: UTF-8
# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# Note that this schema.rb definition is the authoritative source for your
# database schema. If you need to create the application database on another
# system, you should be using db:schema:load, not running all the migrations
# from scratch. The latter is a flawed and unsustainable approach (the more migrations
# you'll amass, the slower it'll run and the greater likelihood for issues).
#
# It's strongly recommended to check this file into your version control system.

ActiveRecord::Schema.define(:version => 20130817224005) do

  create_table "cards", :force => true do |t|
    t.string   "dir"
    t.integer  "value"
    t.integer  "player_id"
    t.integer  "game_id"
    t.string   "location"
    t.datetime "created_at",  :null => false
    t.datetime "updated_at",  :null => false
    t.string   "action_type"
  end

  create_table "comments", :force => true do |t|
    t.text     "body",       :limit => 255
    t.integer  "topic_id"
    t.string   "topic_type"
    t.integer  "parent_id"
    t.integer  "author_id"
    t.datetime "created_at",                :null => false
    t.datetime "updated_at",                :null => false
    t.boolean  "deleted"
  end

  add_index "comments", ["author_id"], :name => "index_comments_on_author_id"
  add_index "comments", ["parent_id"], :name => "index_comments_on_parent_id"
  add_index "comments", ["topic_id"], :name => "index_comments_on_topic_id"

  create_table "damage_tokens", :force => true do |t|
    t.integer  "value"
    t.integer  "player_id"
    t.integer  "game_id"
    t.boolean  "fake",       :default => false
    t.datetime "created_at",                    :null => false
    t.datetime "updated_at",                    :null => false
  end

  create_table "feedbacks", :force => true do |t|
    t.string   "topic"
    t.text     "body",       :limit => 255
    t.datetime "created_at",                :null => false
    t.datetime "updated_at",                :null => false
  end

  create_table "games", :force => true do |t|
    t.string   "phase"
    t.string   "result"
    t.datetime "created_at",                    :null => false
    t.datetime "updated_at",                    :null => false
    t.boolean  "queue",      :default => false
    t.integer  "winner_id"
    t.integer  "loser_id"
  end

  create_table "players", :force => true do |t|
    t.integer  "game_id"
    t.integer  "user_id"
    t.datetime "created_at", :null => false
    t.datetime "updated_at", :null => false
    t.boolean  "ready"
    t.boolean  "absent"
  end

  create_table "posts", :force => true do |t|
    t.string   "title"
    t.text     "body",       :limit => 255
    t.string   "image_url"
    t.integer  "author_id"
    t.datetime "created_at",                :null => false
    t.datetime "updated_at",                :null => false
  end

  add_index "posts", ["author_id"], :name => "index_posts_on_author_id"

  create_table "rules", :force => true do |t|
    t.string   "title"
    t.text     "text",       :limit => 255
    t.string   "game"
    t.datetime "created_at",                :null => false
    t.datetime "updated_at",                :null => false
  end

  create_table "tanks", :force => true do |t|
    t.integer  "position"
    t.integer  "player_id"
    t.integer  "game_id"
    t.boolean  "fake"
    t.datetime "created_at", :null => false
    t.datetime "updated_at", :null => false
  end

  create_table "users", :force => true do |t|
    t.string   "username"
    t.boolean  "admin"
    t.datetime "created_at",                             :null => false
    t.datetime "updated_at",                             :null => false
    t.string   "email",                  :default => "", :null => false
    t.string   "encrypted_password",     :default => "", :null => false
    t.string   "reset_password_token"
    t.datetime "reset_password_sent_at"
    t.datetime "remember_created_at"
    t.integer  "sign_in_count",          :default => 0
    t.datetime "current_sign_in_at"
    t.datetime "last_sign_in_at"
    t.string   "current_sign_in_ip"
    t.string   "last_sign_in_ip"
    t.string   "avatar_file_name"
    t.string   "avatar_content_type"
    t.integer  "avatar_file_size"
    t.datetime "avatar_updated_at"
    t.boolean  "guest"
  end

  add_index "users", ["email"], :name => "index_users_on_email", :unique => true
  add_index "users", ["reset_password_token"], :name => "index_users_on_reset_password_token", :unique => true
  add_index "users", ["username"], :name => "index_users_on_username", :unique => true

end
